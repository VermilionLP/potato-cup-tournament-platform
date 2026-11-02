// What happens after a result lands, shared by the match routes, the event
// start and the auto-confirm timer: applying a reported result, walkovers
// for forfeited players, and the "your match is ready" push to the two
// players of every match that just became playable.

import { MatchRepo } from '../repositories/match-repo.js';
import { getPlayerDisplayName } from '../repositories/player-repo.js';
import { claimNotice, pushEnabled, sendToPlayers } from './push-sender.js';

/** Records a walkover (winner_id) and moves the bracket on. */
export async function recordWalkover(db, tournamentId, matchId, winnerId) {
  const repo = MatchRepo(db);
  await db.query(`
    UPDATE axsuck.matches SET status = 'walkover', winner_id = $1, score1 = 0, score2 = 0, pending_report = NULL
    WHERE id = $2
  `, [winnerId, matchId]);
  const match = await repo.getById(matchId);
  const advanced = await repo.advanceWinner(tournamentId, matchId);
  return { match, advanced };
}

/** Applies a reported result ({ kind, score1, score2 } or { kind: 'walkover', winner_id }). */
export async function applyReport(db, tournamentId, matchId, report) {
  if (report.kind === 'walkover') return recordWalkover(db, tournamentId, matchId, report.winner_id);
  const repo = MatchRepo(db);
  const match = await repo.submitResult(matchId, report.score1, report.score2);
  const advanced = await repo.advanceWinner(tournamentId, matchId);
  return { match, advanced };
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
  if (!pushEnabled()) return 0;
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
  if (!pushEnabled() || report.kind !== 'score') return 0;
  const opponent = match.player1_id === report.by ? match.player2_id : match.player1_id;
  const event = (await db.query('SELECT name FROM axsuck.tournaments WHERE id = $1', [tournamentId])).rows[0];
  const names = new Map((await db.query(
    'SELECT id, battle_tags FROM axsuck.players WHERE id = ANY($1::text[])', [[match.player1_id, match.player2_id]],
  )).rows.map((p) => [p.id, getPlayerDisplayName(p) || p.id]));
  const score = `${names.get(match.player1_id) || match.player1_id} ${report.score1} : ${report.score2} ${names.get(match.player2_id) || match.player2_id}`;
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
  notifyReadyMatches(fastify.db, tournamentId, fastify.log).catch((err) => {
    fastify.log?.error({ err, tournamentId }, 'ready notices failed');
  });
}
