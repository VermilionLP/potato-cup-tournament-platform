// The match-day console (/tournament/[id]/console): one board of what the
// admins have to watch. Pure.

import { REPORT_CONFIRM_MINUTES } from "./report-rules.js";

const decided = (m) => m.status === "completed" || m.status === "walkover";

/** Minutes left before an undisputed score takes effect on its own (0 = due). */
export function minutesToAutoConfirm(report, now = Date.now()) {
  const at = Date.parse(report?.at);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at + REPORT_CONFIRM_MINUTES * 60000 - now) / 60000));
}

/**
 * {
 *   live: [{ channel, match }]           channels with a live match
 *   disputed: [match]                     disputed reports and walkover claims (an admin decides)
 *   toConfirm: [{ match, minutes }]       scores waiting for the opponent
 *   ready: [match]                        playable, nobody reported, not live
 *   waiting: [match]                      one player known, the other still playing
 *   absent: [player]                      registration with check-in: not checked in
 *   checkedIn, players, done, total       counts
 * }
 */
export function matchDayBoard(t, order = new Map(), now = Date.now()) {
  const matches = t?.matches || [];
  const rank = (m) => order.get(m.id) ?? m.id;
  const byOrder = (a, b) => rank(a) - rank(b);
  const liveIds = new Map((t?.live_channels || []).filter((c) => c.active_match_id).map((c) => [c.active_match_id, c.channel]));
  const pending = matches.filter((m) => m.status === "pending").sort(byOrder);
  const playable = pending.filter((m) => m.player1_id && m.player2_id);
  const players = t?.players || [];
  const counted = matches.filter((m) => m.player1_id && m.player2_id || decided(m));

  return {
    live: (t?.live_channels || [])
      .filter((c) => c.active_match_id)
      .map((c) => ({ channel: c.channel, match: matches.find((m) => m.id === c.active_match_id) || null }))
      .filter((x) => x.match),
    disputed: playable.filter((m) => m.pending_report && (m.pending_report.disputed || m.pending_report.kind === "walkover")),
    toConfirm: playable
      .filter((m) => m.pending_report && !m.pending_report.disputed && m.pending_report.kind === "score")
      .map((match) => ({ match, minutes: minutesToAutoConfirm(match.pending_report, now) })),
    ready: playable.filter((m) => !m.pending_report && !liveIds.has(m.id)),
    waiting: pending.filter((m) => Boolean(m.player1_id) !== Boolean(m.player2_id)),
    absent: t?.status === "registration" && t?.checkin?.enabled ? players.filter((p) => !p.checked_in_at) : [],
    checkedIn: players.filter((p) => p.checked_in_at).length,
    players: players.length,
    done: counted.filter(decided).length,
    total: counted.length,
  };
}
