// What happens after a result lands, shared by the match routes, the event
// start and the auto-confirm timer: applying a reported result, walkovers
// for forfeited players, and the "your match is ready" push to the two
// players of every match that just became playable. Each notice also goes
// to the QQ group through the community bot when the bots are on
// (lib/bot-notices.js), whether or not web push is set up.

import { MatchRepo } from '../repositories/match-repo.js';
import { getPlayerDisplayName } from '../repositories/player-repo.js';
import { claimNotice, pushEnabled, sendToPlayers } from './push-sender.js';
import { botNoticesEnabled, noticeText, queueBotNotice, resultLine, walkoverLine } from './bot-notices.js';
import { inTransaction } from './transaction.js';

/**
 * Records a walkover (winner_id) and moves the bracket on, in one
 * transaction: a match is never left done without its winner advanced.
 */
export function recordWalkover(db, tournamentId, matchId, winnerId) {
  return inTransaction(db, (client) => walkoverIn(client, tournamentId, matchId, winnerId));
}

async function walkoverIn(db, tournamentId, matchId, winnerId) {
  const repo = MatchRepo(db);
  await db.query(`
    UPDATE axsuck.matches SET status = 'walkover', winner_id = $1, score1 = 0, score2 = 0, pending_report = NULL
    WHERE id = $2
  `, [winnerId, matchId]);
  const match = await repo.getById(matchId);
  const advanced = await repo.advanceWinner(tournamentId, matchId);
  return { match, advanced };
}

/** Records a score and moves the bracket on, in one transaction. */
export function recordScore(db, tournamentId, matchId, score1, score2) {
  return inTransaction(db, async (client) => {
    const repo = MatchRepo(client);
    const match = await repo.submitResult(matchId, score1, score2);
    const advanced = await repo.advanceWinner(tournamentId, matchId);
    return { match, advanced };
  });
}

/** Applies a reported result ({ kind, score1, score2 } or { kind: 'walkover', winner_id }). */
export async function applyReport(db, tournamentId, matchId, report) {
  if (report.kind === 'walkover') return recordWalkover(db, tournamentId, matchId, report.winner_id);
  return recordScore(db, tournamentId, matchId, report.score1, report.score2);
}

/**
 * Forfeited players (kept in the event at the start without checking in)
 * lose every match they reach by walkover. Repeats until no playable match
 * has a forfeited player (a walkover can fill the next match).
 */
export async function settleForfeits(db, tournamentId) {
  const forfeited = new Set((await db.query(
    'SELECT player_id FROM axsuck.tournament_players WHERE tournament_id = $1 AND forfeited',
    [tournamentId],
  )).rows.map((r) => r.player_id));
  if (!forfeited.size) return 0;
  let settled = 0;
  for (let i = 0; i < 256; i += 1) {
    const { rows } = await db.query(`
      SELECT id, player1_id, player2_id FROM axsuck.matches
      WHERE tournament_id = $1 AND status = 'pending' AND player1_id IS NOT NULL AND player2_id IS NOT NULL
        AND (player1_id = ANY($2::text[]) OR player2_id = ANY($2::text[]))
      ORDER BY id LIMIT 1
    `, [tournamentId, [...forfeited]]);
    const m = rows[0];
    if (!m) break;
    // Both forfeited: the first slot goes through (it plays nobody anyway).
    const winner = forfeited.has(m.player1_id) && !forfeited.has(m.player2_id) ? m.player2_id : m.player1_id;
    await recordWalkover(db, tournamentId, m.id, winner);
    settled += 1;
  }
  return settled;
}

/** "Your match is ready": once per pairing, to both players of every playable match. */
export async function notifyReadyMatches(db, tournamentId, log) {
  const push = pushEnabled();
  const qq = botNoticesEnabled();
  if (!push && !qq) return 0;
  const event = (await db.query('SELECT id, name, status FROM axsuck.tournaments WHERE id = $1', [tournamentId])).rows[0];
  if (!event || event.status !== 'in_progress') return 0;
  const { rows: ready } = await db.query(`
    SELECT id, player1_id, player2_id FROM axsuck.matches
    WHERE tournament_id = $1 AND status = 'pending' AND player1_id IS NOT NULL AND player2_id IS NOT NULL
  `, [tournamentId]);
  if (!ready.length) return 0;
  const ids = [...new Set(ready.flatMap((m) => [m.player1_id, m.player2_id]))];
  const names = new Map((await db.query(
    'SELECT id, battle_tags FROM axsuck.players WHERE id = ANY($1::text[])', [ids],
  )).rows.map((p) => [p.id, getPlayerDisplayName(p) || p.id]));
  let sent = 0;
  for (const m of ready) {
    if (!(await claimNotice(db, m.id, `ready:${m.player1_id}:${m.player2_id}`))) continue;
    const url = `/tournament/${encodeURIComponent(tournamentId)}`;
    if (qq) {
      const a = names.get(m.player1_id) || m.player1_id;
      const b = names.get(m.player2_id) || m.player2_id;
      await queueBotNotice(db, {
        kind: 'ready',
        tournamentId,
        text: noticeText.ready(event.name, a, b),
        mention: [m.player1_id, m.player2_id],
        matchId: m.id,
        data: { event: event.name, a, b },
      }, log);
    }
    if (!push) continue;
    for (const [me, other] of [[m.player1_id, m.player2_id], [m.player2_id, m.player1_id]]) {
      sent += await sendToPlayers(db, [me], {
        title: '轮到你了',
        body: `${event.name}：你的下一场对手是 ${names.get(other) || other}`,
        url,
        tag: `suck-${tournamentId}-ready-${m.id}`,
      }, log);
    }
  }
  return sent;
}

/** Tell the opponent a score is waiting for them. */
export async function notifyReportToConfirm(db, tournamentId, match, report, log) {
  const push = pushEnabled();
  const qq = botNoticesEnabled();
  if ((!push && !qq) || report.kind !== 'score') return 0;
  const opponent = match.player1_id === report.by ? match.player2_id : match.player1_id;
  const event = (await db.query('SELECT name FROM axsuck.tournaments WHERE id = $1', [tournamentId])).rows[0];
  const names = new Map((await db.query(
    'SELECT id, battle_tags FROM axsuck.players WHERE id = ANY($1::text[])', [[match.player1_id, match.player2_id]],
  )).rows.map((p) => [p.id, getPlayerDisplayName(p) || p.id]));
  const score = `${names.get(match.player1_id) || match.player1_id} ${report.score1} : ${report.score2} ${names.get(match.player2_id) || match.player2_id}`;
  if (qq) {
    await queueBotNotice(db, {
      kind: 'confirm',
      tournamentId,
      text: noticeText.confirm(event?.name, names.get(match.player1_id) || match.player1_id, report.score1, report.score2, names.get(match.player2_id) || match.player2_id),
      mention: [opponent],
      matchId: match.id,
    }, log);
  }
  if (!push) return 0;
  return sendToPlayers(db, [opponent], {
    title: '请确认比分',
    body: `${event?.name || ''}：对手提交了 ${score}。10 分钟内不确认也不提出异议将自动生效`,
    url: `/tournament/${encodeURIComponent(tournamentId)}`,
    tag: `suck-${tournamentId}-confirm-${match.id}`,
  }, log);
}

/** After any result: forfeits, then the ready notices (never fails the request). */
export async function afterResult(fastify, tournamentId) {
  try {
    await settleForfeits(fastify.db, tournamentId);
  } catch (err) {
    fastify.log?.error({ err, tournamentId }, 'settling forfeits failed');
  }
  // Results first, so the group reads "A won" before "A's next match is ready".
  notifyResults(fastify.db, tournamentId, fastify.log)
    .catch((err) => fastify.log?.error({ err, tournamentId }, 'result notices failed'))
    .then(() => notifyReadyMatches(fastify.db, tournamentId, fastify.log))
    .catch((err) => fastify.log?.error({ err, tournamentId }, 'ready notices failed'));
}

/** How recent a result must be to be announced (afterResult runs right after it lands). */
export const RESULT_NOTICE_WINDOW_MINUTES = 10;

/**
 * Results for the QQ group: every match of the event that was decided in
 * the last few minutes, once per outcome (a result that is rolled back and
 * entered differently is announced again; the same one is not).
 */
export async function notifyResults(db, tournamentId, log) {
  if (!botNoticesEnabled()) return 0;
  const event = (await db.query('SELECT id, name FROM axsuck.tournaments WHERE id = $1', [tournamentId])).rows[0];
  if (!event) return 0;
  const { rows: done } = await db.query(`
    SELECT id, player1_id, player2_id, winner_id, score1, score2, status FROM axsuck.matches
    WHERE tournament_id = $1 AND status IN ('completed', 'walkover') AND winner_id IS NOT NULL
      AND updated_at > NOW() - ($2::int * INTERVAL '1 minute')
    ORDER BY updated_at, id
  `, [tournamentId, RESULT_NOTICE_WINDOW_MINUTES]);
  let queued = 0;
  for (const m of done) {
    // Byes (one side empty) are not results anyone waits for.
    if (!m.player1_id || !m.player2_id) continue;
    if (!(await claimNotice(db, m.id, `qq-result:${m.status}:${m.winner_id}:${m.score1}:${m.score2}`))) continue;
    const loser = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
    const line = m.status === 'walkover'
      ? walkoverLine(m.winner_id, loser)
      : resultLine(m.player1_id, m.score1, m.score2, m.player2_id, m.winner_id);
    const text = m.status === 'walkover'
      ? noticeText.walkover(event.name, m.winner_id, loser)
      : noticeText.result(event.name, m.player1_id, m.score1, m.score2, m.player2_id, m.winner_id);
    if (await queueBotNotice(db, { kind: 'result', tournamentId, text, matchId: m.id, data: { event: event.name, line } }, log)) queued += 1;
  }
  return queued;
}

/**
 * Ban / Pick: tells the player whose turn it is to ban (once per turn and
 * player; an undo and redo does not send it again).
 */
export async function notifyBanTurn(db, tournamentId, match, record, log) {
  const state = record?.state;
  const push = pushEnabled();
  const qq = botNoticesEnabled();
  if ((!push && !qq) || state?.phase !== 'ban') return 0;
  const side = state.bans.length % 2 === 0 ? 'A' : 'B';
  const playerId = side === 'A' ? match.player1_id : match.player2_id;
  const opponentId = side === 'A' ? match.player2_id : match.player1_id;
  if (!playerId || !(await claimNotice(db, match.id, `bp-turn-${state.bans.length}-${playerId}`))) return 0;
  const event = (await db.query('SELECT name FROM axsuck.tournaments WHERE id = $1', [tournamentId])).rows[0];
  const other = (await db.query('SELECT id, battle_tags FROM axsuck.players WHERE id = $1', [opponentId])).rows[0];
  const last = state.bans.at(-1);
  const who = getPlayerDisplayName(other) || opponentId;
  const before = !last ? '' : last.group ? `${who} 禁用了 ${last.group}，` : `${who} 空过，`;
  if (qq) {
    await queueBotNotice(db, {
      kind: 'ban',
      tournamentId,
      text: noticeText.ban(event?.name, playerId, before.replace(/，$/, '')),
      mention: [playerId],
      matchId: match.id,
    }, log);
  }
  if (!push) return 0;
  return sendToPlayers(db, [playerId], {
    title: '轮到你禁用了',
    body: `${event?.name || ''}：${before}请打开 Ban/Pick 选择要禁用的大组`,
    url: `/tournament/${encodeURIComponent(tournamentId)}`,
    tag: `suck-${tournamentId}-bp-${match.id}`,
  }, log);
}
