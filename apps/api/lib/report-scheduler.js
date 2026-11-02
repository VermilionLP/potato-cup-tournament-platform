// Undisputed scores reported by a player take effect REPORT_CONFIRM_MS
// after they were reported (lib/match-reports.js). Checked every 30 s.

import { isDueForAutoConfirm } from './match-reports.js';
import { afterResult, applyReport } from './match-flow.js';
import { invalidateLadder } from './ladder-cache.js';

export async function confirmDueReports(fastify, now = Date.now()) {
  const { rows } = await fastify.db.query(`
    SELECT id, tournament_id, pending_report FROM axsuck.matches
    WHERE pending_report IS NOT NULL AND status = 'pending'
  `);
  const due = rows.filter((m) => isDueForAutoConfirm(m.pending_report, now));
  for (const m of due) {
    try {
      await applyReport(fastify.db, m.tournament_id, m.id, m.pending_report);
      invalidateLadder(fastify.db);
      fastify.tournamentEvents.emit(`update:${m.tournament_id}`, { type: 'match_result_auto_confirmed', matchId: m.id });
      await afterResult(fastify, m.tournament_id);
    } catch (err) {
      fastify.log.error({ err, matchId: m.id }, 'auto-confirming a report failed');
    }
  }
  return due.length;
}

export function startReportScheduler(fastify) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await confirmDueReports(fastify);
    } catch (err) {
      fastify.log.error({ err }, 'report scheduler tick failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 30_000);
  timer.unref?.();
  fastify.addHook('onClose', async () => clearInterval(timer));
}
