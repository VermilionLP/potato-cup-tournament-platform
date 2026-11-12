// Players' results on the site and from the QQ bot (routes/matches.js,
// routes/bot.js): a player's report waits for the opponent, who confirms or
// disputes it (rules in lib/match-reports.js). These apply them to a match
// and tell everyone (live pages, the opponent through the QQ group, admins
// when one needs them).

import { needsAdmin, notifyAdmins } from './admin-alerts.js';
import { MatchRepo } from '../repositories/match-repo.js';
import { applyReport, afterResult, notifyReportToConfirm } from './match-flow.js';
import { canConfirm, canDispute, playerReport, reportToApply } from './match-reports.js';

const emit = (fastify, tournamentId, matchId, type) => fastify.tournamentEvents.emit(`update:${tournamentId}`, { type, matchId });

// Playoff seeding came from the group stage, so its results are frozen
// until the playoff is withdrawn.
export async function rejectGroupEditDuringPlayoffs(fastify, match) {
  if (!['sw', 'gse', 'gwb', 'glb'].includes(match.bracket)) return;
  const res = await fastify.db.query('SELECT current_stage FROM axsuck.tournaments WHERE id = $1', [match.tournament_id]);
  if (res.rows[0]?.current_stage === 'playoff') {
    throw fastify.httpErrors.badRequest('淘汰赛已开始，修改小组赛结果前请先撤回淘汰赛');
  }
}

/** A player can report on an open match with both players in it. */
export function requireOpenMatch(fastify, match) {
  if (match.status !== 'pending' || !match.player1_id || !match.player2_id) {
    throw fastify.httpErrors.badRequest('这场比赛现在不能提交结果');
  }
}

/**
 * A player's report: stored for the opponent (or an admin) to confirm,
 * applied when it matches the opponent's, or disputed. Returns { match,
 * report: pending | confirmed | disputed, ... }.
 */
export async function submitReport(fastify, tournamentId, match, by, report) {
  const repo = MatchRepo(fastify.db);
  const { action, pending } = playerReport(match, by, report);
  if (action === 'confirm') {
    const result = await applyReport(fastify.db, tournamentId, match.id, pending);
    emit(fastify, tournamentId, match.id, 'match_result_submitted');
    await afterResult(fastify, tournamentId);
    return { ...result, report: 'confirmed' };
  }
  await fastify.db.query('UPDATE axsuck.matches SET pending_report = $1 WHERE id = $2', [JSON.stringify(pending), match.id]);
  emit(fastify, tournamentId, match.id, action === 'dispute' ? 'match_report_disputed' : 'match_report_submitted');
  if (action === 'store') {
    notifyReportToConfirm(fastify.db, tournamentId, match, pending, fastify.log).catch(() => {});
  }
  // A dispute or a walkover claim waits for an admin: tell them.
  if (needsAdmin(pending)) notifyAdmins(fastify.db, tournamentId, match, pending, fastify.log).catch(() => {});
  return { match: await repo.getById(match.id), report: action === 'dispute' ? 'disputed' : 'pending' };
}

/**
 * The opponent (a score) or an admin (anything; `which`: 'report' or
 * 'counter' for a disputed one) confirms the pending report.
 */
export async function confirmReport(fastify, tournamentId, match, { admin = false, by = null, which = 'report' } = {}) {
  const report = match.pending_report;
  if (!report || match.status !== 'pending') throw fastify.httpErrors.badRequest('这场比赛没有待确认的结果');
  if (!admin && !canConfirm(match, by)) {
    throw fastify.httpErrors.forbidden(report.kind === 'walkover' ? '弃权申报需要管理员确认' : '只有对手可以确认这个比分');
  }
  await rejectGroupEditDuringPlayoffs(fastify, match);
  const result = await applyReport(fastify.db, tournamentId, match.id, reportToApply(report, admin ? which : 'report'));
  emit(fastify, tournamentId, match.id, 'match_result_submitted');
  await afterResult(fastify, tournamentId);
  return result;
}

/** The opponent disputes the pending report: it waits for an admin. */
export async function disputeReport(fastify, tournamentId, match, { admin = false, by = null } = {}) {
  const report = match.pending_report;
  if (!report) throw fastify.httpErrors.badRequest('这场比赛没有待确认的结果');
  if (!admin && !canDispute(match, by)) throw fastify.httpErrors.forbidden('只有对手可以对这个结果提出异议');
  const disputed = { ...report, disputed: true, disputed_by: by || 'admin', disputed_at: new Date().toISOString() };
  await fastify.db.query('UPDATE axsuck.matches SET pending_report = $1 WHERE id = $2', [JSON.stringify(disputed), match.id]);
  emit(fastify, tournamentId, match.id, 'match_report_disputed');
  if (!admin) notifyAdmins(fastify.db, tournamentId, match, disputed, fastify.log).catch(() => {});
  return { match: await MatchRepo(fastify.db).getById(match.id) };
}
