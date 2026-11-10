// Matches waiting for an admin: a disputed score report or a player's
// walkover claim (lib/match-reports.js). The site shows them to admins
// (GET /admin/pending: the shield's count and the /admin page), and when
// one comes in, the admins chosen on /admin (ALERT_KEY in admin_settings)
// get a browser notification and an @ in the QQ group from the community
// bot. Without anyone chosen, the group notice still goes out, without @.

import { getPlayerDisplayName } from '../repositories/player-repo.js';
import { noticeText, queueBotNotice, botNoticesEnabled } from './bot-notices.js';
import { pushEnabled, sendToPlayers } from './push-sender.js';

export const ALERT_KEY = 'alert_players';
export const MAX_ALERT_PLAYERS = 10;

/** Whether a pending report needs an admin. */
export function needsAdmin(report) {
  return Boolean(report && (report.disputed || report.kind === 'walkover'));
}

/**
 * Rows [{ match_id, tournament_id, tournament, player1_id, player2_id,
 * pending_report }] -> items for admins, oldest first: { kind: 'dispute' |
 * 'walkover', ...ids, by, at, report }.
 */
export function pendingItems(rows = []) {
  return rows
    .filter((r) => needsAdmin(r.pending_report))
    .map((r) => {
      const p = r.pending_report;
      return {
        kind: p.disputed ? 'dispute' : 'walkover',
        tournament_id: r.tournament_id,
        tournament: r.tournament,
        match_id: r.match_id,
        player1_id: r.player1_id,
        player2_id: r.player2_id,
        by: p.by || null,
        at: p.disputed_at || p.counter?.at || p.at || null,
        report: p,
      };
    })
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** Pending items across running events. */
export async function loadPending(db) {
  const { rows } = await db.query(`
    SELECT m.id AS match_id, m.tournament_id, t.name AS tournament, m.player1_id, m.player2_id, m.pending_report
    FROM axsuck.matches m JOIN axsuck.tournaments t ON t.id = m.tournament_id
    WHERE t.status = 'in_progress' AND m.status = 'pending' AND m.pending_report IS NOT NULL`);
  return pendingItems(rows);
}

/** The player ids admins chose to alert. */
export async function alertPlayers(db) {
  const { rows } = await db.query('SELECT value FROM axsuck.admin_settings WHERE key = $1', [ALERT_KEY]);
  const list = rows[0]?.value;
  return Array.isArray(list) ? list.map(String).filter(Boolean).slice(0, MAX_ALERT_PLAYERS) : [];
}

export async function setAlertPlayers(db, ids) {
  const list = [...new Set((ids || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, MAX_ALERT_PLAYERS);
  await db.query(
    `INSERT INTO axsuck.admin_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [ALERT_KEY, JSON.stringify(list)],
  );
  return list;
}

/** The alert text for a match (QQ group and browser notification). */
export function alertText(event, report, a, b, nameOf = (id) => id) {
  if (report.disputed) {
    const first = report.kind === 'walkover' ? `${nameOf(report.winner_id)} 不战而胜` : `${report.score1} : ${report.score2}`;
    const disputer = report.disputed_by || report.counter?.by;
    return noticeText.adminDispute(event, a, b, nameOf(report.by), first, disputer && disputer !== 'admin' ? nameOf(disputer) : null);
  }
  return noticeText.adminWalkover(event, a, b, nameOf(report.by));
}

/**
 * Tells the chosen admins that a match needs them. Never throws; returns
 * how many notices went out.
 */
export async function notifyAdmins(db, tournamentId, match, report, log = console) {
  if (!needsAdmin(report) || (!pushEnabled() && !botNoticesEnabled())) return 0;
  try {
    const event = (await db.query('SELECT name FROM axsuck.tournaments WHERE id = $1', [tournamentId])).rows[0];
    const names = new Map((await db.query(
      'SELECT id, battle_tags FROM axsuck.players WHERE id = ANY($1::text[])', [[match.player1_id, match.player2_id]],
    )).rows.map((p) => [p.id, getPlayerDisplayName(p) || p.id]));
    const nameOf = (id) => names.get(id) || id;
    const admins = await alertPlayers(db);
    const text = alertText(event?.name, report, nameOf(match.player1_id), nameOf(match.player2_id), nameOf);
    let sent = 0;
    if (await queueBotNotice(db, { kind: 'admin', tournamentId, text, mention: admins }, log)) sent += 1;
    if (admins.length && pushEnabled()) {
      sent += await sendToPlayers(db, admins, {
        title: report.disputed ? '比分有异议，需要管理员处理' : '弃权申报，需要管理员确认',
        body: text.replace(/^【[^】]*】/, `${event?.name || ''}：`).split('\n')[0],
        url: `/tournament/${encodeURIComponent(tournamentId)}/console`,
        tag: `suck-${tournamentId}-admin-${match.id}`,
      }, log);
    }
    return sent;
  } catch (err) {
    log.error?.({ err, tournamentId, matchId: match?.id }, 'admin alert failed');
    return 0;
  }
}
