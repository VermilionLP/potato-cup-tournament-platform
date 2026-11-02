// Results reported by players (migration 034). A player's score waits for
// the opponent: the opponent confirms it (or reports the same score), or
// disputes it (or reports a different one) and an admin settles it. A
// score nobody disputes takes effect REPORT_CONFIRM_MS after it was
// reported. A player's walkover claim always needs an admin. Admins' own
// results take effect at once. Pure: what a report does to the match's
// pending_report.

export const REPORT_CONFIRM_MS = 10 * 60 * 1000;

const opponentOf = (match, id) => (match.player1_id === id ? match.player2_id : match.player1_id);

/**
 * A player's report (`report`: { kind: 'score', score1, score2 } or
 * { kind: 'walkover', winner_id }). Returns { action, pending }:
 *   store    pending is the new pending_report
 *   confirm  the opponent reported the same score: apply `pending`
 *   dispute  pending is the existing report, disputed, with this as counter
 */
export function playerReport(match, by, report, now = new Date()) {
  const at = now.toISOString();
  const entry = report.kind === 'walkover'
    ? { kind: 'walkover', winner_id: report.winner_id }
    : { kind: 'score', score1: Number(report.score1), score2: Number(report.score2) };
  const existing = match.pending_report;
  if (!existing || existing.by === by) {
    return { action: 'store', pending: { ...entry, by, at, disputed: false, counter: null } };
  }
  // The opponent reported first.
  if (existing.kind === 'score' && entry.kind === 'score' && !existing.disputed
    && existing.score1 === entry.score1 && existing.score2 === entry.score2) {
    return { action: 'confirm', pending: existing };
  }
  return { action: 'dispute', pending: { ...existing, disputed: true, counter: { ...entry, by, at } } };
}

/** Whether `playerId` may confirm the pending report (admins always may). */
export function canConfirm(match, playerId) {
  const r = match.pending_report;
  if (!r || !playerId || r.kind !== 'score' || r.disputed) return false;
  return playerId === opponentOf(match, r.by);
}

/** Whether `playerId` may dispute it: the opponent of the reporter. */
export function canDispute(match, playerId) {
  const r = match.pending_report;
  if (!r || !playerId || r.disputed) return false;
  return playerId === opponentOf(match, r.by);
}

/** Undisputed scores past the confirmation window take effect. */
export function isDueForAutoConfirm(report, now = Date.now()) {
  if (!report || report.kind !== 'score' || report.disputed) return false;
  const at = Date.parse(report.at);
  return Number.isFinite(at) && now - at >= REPORT_CONFIRM_MS;
}

/** The report an admin applies: the original, or the counter-report. */
export function reportToApply(report, which = 'report') {
  if (!report) return null;
  return which === 'counter' && report.counter ? report.counter : report;
}

/** A score report must have two whole, non-negative, different scores. */
export function scoreProblem(score1, score2) {
  const a = Number(score1);
  const b = Number(score2);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return '比分必须是非负整数';
  if (a === b) return '比分不能打平';
  return null;
}
