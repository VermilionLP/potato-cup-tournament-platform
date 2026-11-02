import { MatchRepo } from '../repositories/match-repo.js';
import { getRequesterId, isAdminRequest, requireAdmin, requireMatchPlayerOrAdmin } from '../lib/admin.js';
import { inTransaction } from '../lib/transaction.js';
import { canConfirm, canDispute, playerReport, reportToApply, scoreProblem } from '../lib/match-reports.js';
import { afterResult, applyReport, notifyReportToConfirm, recordWalkover } from '../lib/match-flow.js';

export default async function matchesRoutes(fastify) {
  const repo = MatchRepo(fastify.db);

  // Playoff seeding came from the group stage, so its results are frozen
  // until the playoff is withdrawn.
  async function rejectGroupEditDuringPlayoffs(match) {
    if (!['sw', 'gse', 'gwb', 'glb'].includes(match.bracket)) return;
    const res = await fastify.db.query(
      'SELECT current_stage FROM axsuck.tournaments WHERE id = $1',
      [match.tournament_id],
    );
    if (res.rows[0]?.current_stage === 'playoff') {
      throw fastify.httpErrors.badRequest('淘汰赛已开始，修改小组赛结果前请先撤回淘汰赛');
    }
  }

  async function matchOf(req) {
    const match = await repo.getById(parseInt(req.params.matchId));
    if (!match || match.tournament_id !== req.params.id) {
      throw fastify.httpErrors.notFound('Match not found in this tournament');
    }
    return match;
  }

  // A player reports on an open match with both players in it.
  function requireOpenMatch(match) {
    if (match.status !== 'pending' || !match.player1_id || !match.player2_id) {
      throw fastify.httpErrors.badRequest('这场比赛现在不能提交结果');
    }
  }

  function emitReport(tournamentId, matchId, type) {
    fastify.tournamentEvents.emit(`update:${tournamentId}`, { type, matchId });
  }

  // A player's report (lib/match-reports.js): stored for the opponent (or an
  // admin) to confirm, applied when it matches the opponent's, or disputed.
  async function playerReports(req, match, report) {
    const by = getRequesterId(req);
    const { action, pending } = playerReport(match, by, report);
    if (action === 'confirm') {
      const result = await applyReport(fastify.db, req.params.id, match.id, pending);
      emitReport(req.params.id, match.id, 'match_result_submitted');
      await afterResult(fastify, req.params.id);
      return { ...result, report: 'confirmed' };
    }
    await fastify.db.query('UPDATE axsuck.matches SET pending_report = $1 WHERE id = $2', [JSON.stringify(pending), match.id]);
    emitReport(req.params.id, match.id, action === 'dispute' ? 'match_report_disputed' : 'match_report_submitted');
    if (action === 'store') {
      notifyReportToConfirm(fastify.db, req.params.id, match, pending, fastify.log).catch(() => {});
    }
    return { match: await repo.getById(match.id), report: action === 'dispute' ? 'disputed' : 'pending' };
  }

  // Admins' results take effect at once; players' wait for the opponent.
  fastify.post('/tournaments/:id/matches/:matchId/result', async (req) => {
    const { score1, score2 } = req.body || {};
    if (score1 == null || score2 == null) {
      throw fastify.httpErrors.badRequest('score1 and score2 are required');
    }
    const match = await matchOf(req);
    await requireMatchPlayerOrAdmin(fastify, req, match);
    await rejectGroupEditDuringPlayoffs(match);

    if (!isAdminRequest(req)) {
      requireOpenMatch(match);
      const problem = scoreProblem(score1, score2);
      if (problem) throw fastify.httpErrors.badRequest(problem);
      return playerReports(req, match, { kind: 'score', score1, score2 });
    }

    const updated = await repo.submitResult(match.id, score1, score2);
    const advanced = await repo.advanceWinner(req.params.id, match.id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'match_result_submitted', matchId: match.id });
    await afterResult(fastify, req.params.id);

    return { match: updated, advanced };
  });

  // A walkover: at once from an admin; a player's claim waits for an admin.
  fastify.post('/tournaments/:id/matches/:matchId/walkover', async (req) => {
    const { winner_id } = req.body || {};
    if (!winner_id) throw fastify.httpErrors.badRequest('winner_id is required');

    const match = await matchOf(req);
    await requireMatchPlayerOrAdmin(fastify, req, match);
    await rejectGroupEditDuringPlayoffs(match);
    if (winner_id !== match.player1_id && winner_id !== match.player2_id) {
      throw fastify.httpErrors.badRequest('winner_id must be one of the match players');
    }

    if (!isAdminRequest(req)) {
      requireOpenMatch(match);
      return playerReports(req, match, { kind: 'walkover', winner_id });
    }

    const result = await recordWalkover(fastify.db, req.params.id, match.id, winner_id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'match_walkover_submitted', matchId: match.id });
    await afterResult(fastify, req.params.id);

    return result;
  });

  // The opponent (a score) or an admin (anything; `which`: 'report' or
  // 'counter' for a disputed one) confirms a pending report.
  fastify.post('/tournaments/:id/matches/:matchId/report/confirm', async (req) => {
    const match = await matchOf(req);
    await requireMatchPlayerOrAdmin(fastify, req, match);
    const report = match.pending_report;
    if (!report || match.status !== 'pending') throw fastify.httpErrors.badRequest('这场比赛没有待确认的结果');
    const admin = isAdminRequest(req);
    if (!admin && !canConfirm(match, getRequesterId(req))) {
      throw fastify.httpErrors.forbidden(report.kind === 'walkover' ? '弃权申报需要管理员确认' : '只有对手可以确认这个比分');
    }
    await rejectGroupEditDuringPlayoffs(match);
    const chosen = reportToApply(report, admin ? req.body?.which : 'report');
    const result = await applyReport(fastify.db, req.params.id, match.id, chosen);
    emitReport(req.params.id, match.id, 'match_result_submitted');
    await afterResult(fastify, req.params.id);
    return result;
  });

  // The opponent disputes a pending report: it waits for an admin.
  fastify.post('/tournaments/:id/matches/:matchId/report/dispute', async (req) => {
    const match = await matchOf(req);
    await requireMatchPlayerOrAdmin(fastify, req, match);
    const report = match.pending_report;
    if (!report) throw fastify.httpErrors.badRequest('这场比赛没有待确认的结果');
    if (!isAdminRequest(req) && !canDispute(match, getRequesterId(req))) {
      throw fastify.httpErrors.forbidden('只有对手可以对这个结果提出异议');
    }
    const disputed = { ...report, disputed: true, disputed_by: getRequesterId(req) || 'admin', disputed_at: new Date().toISOString() };
    await fastify.db.query('UPDATE axsuck.matches SET pending_report = $1 WHERE id = $2', [JSON.stringify(disputed), match.id]);
    emitReport(req.params.id, match.id, 'match_report_disputed');
    return { match: await repo.getById(match.id) };
  });

  // The reporter takes a report back (before it is settled), or an admin drops it.
  fastify.delete('/tournaments/:id/matches/:matchId/report', async (req) => {
    const match = await matchOf(req);
    await requireMatchPlayerOrAdmin(fastify, req, match);
    const report = match.pending_report;
    if (!report) return { match };
    if (!isAdminRequest(req) && report.by !== getRequesterId(req)) {
      throw fastify.httpErrors.forbidden('只能撤回自己提交的结果');
    }
    await fastify.db.query('UPDATE axsuck.matches SET pending_report = NULL WHERE id = $1', [match.id]);
    emitReport(req.params.id, match.id, 'match_report_withdrawn');
    return { match: await repo.getById(match.id) };
  });

  fastify.post('/tournaments/:id/matches/manual', async (req) => {
    requireAdmin(fastify, req);
    const { round, position, player1_id, player2_id } = req.body;
    if (round == null || position == null) {
      throw fastify.httpErrors.badRequest('round and position are required');
    }
    const match = await repo.create({
      tournament_id: req.params.id,
      round,
      position,
      player1_id,
      player2_id
    });

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'match_created', matchId: match.id });

    return match;
  });

  fastify.delete('/tournaments/:id/matches', async (req) => {
    requireAdmin(fastify, req);
    await repo.clearMatches(req.params.id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'matches_cleared' });

    return { success: true };
  });

  fastify.post('/tournaments/:id/matches/:matchId/rollback', async (req) => {
    requireAdmin(fastify, req);
    const matchId = parseInt(req.params.matchId);
    const match = await repo.getById(matchId);
    if (!match) throw fastify.httpErrors.notFound('Match not found');
    await rejectGroupEditDuringPlayoffs(match);

    await inTransaction(fastify.db, async (client) => {
      async function recursiveRollback(mId, depth = 0) {
        if (depth > 64) return;
        const mRes = await client.query('SELECT * FROM axsuck.matches WHERE id = $1', [mId]);
        const m = mRes.rows[0];
        if (!m) return;

        // Rolling back the first grand final also removes a pending reset match.
        if (m.bracket === 'gf' && m.position === 1) {
          const resetRes = await client.query(`
            SELECT id FROM axsuck.matches
            WHERE tournament_id = $1 AND bracket = 'gf' AND position = 2
          `, [m.tournament_id]);
          for (const reset of resetRes.rows) {
            // A live channel showing it drops it (live_channels FK).
            await client.query('DELETE FROM axsuck.matches WHERE id = $1', [reset.id]);
          }
        }

        await client.query(`
          UPDATE axsuck.matches SET score1 = 0, score2 = 0, winner_id = NULL, status = 'pending', pending_report = NULL
          WHERE id = $1
        `, [mId]);

        const targets = [];
        if (m.next_match_id && m.next_slot) {
          targets.push({ id: m.next_match_id, slot: m.next_slot });
        }
        if (m.loser_next_match_id && m.loser_next_slot) {
          targets.push({ id: m.loser_next_match_id, slot: m.loser_next_slot });
        }

        // Legacy single-elimination brackets advance by position, not by link.
        if (targets.length === 0 && (!m.bracket || m.bracket === 'main')) {
          const nextRound = m.round - 1;
          if (nextRound >= 1) {
            const nextPosition = Math.ceil(m.position / 2);
            const nextRes = await client.query(`
              SELECT * FROM axsuck.matches
              WHERE tournament_id = $1 AND bracket = 'main' AND round = $2 AND position = $3
            `, [m.tournament_id, nextRound, nextPosition]);
            const nextMatch = nextRes.rows[0];
            if (nextMatch) {
              targets.push({
                id: nextMatch.id,
                slot: m.position % 2 === 1 ? 1 : 2,
              });
            }
          }
        }

        for (const target of targets) {
          const playerColumn = target.slot === 1 ? 'player1_id' : 'player2_id';
          const voidColumn = target.slot === 1 ? 'slot1_void' : 'slot2_void';
          await client.query(`
            UPDATE axsuck.matches SET ${playerColumn} = NULL, ${voidColumn} = FALSE
            WHERE id = $1
          `, [target.id]);

          const targetRes = await client.query('SELECT * FROM axsuck.matches WHERE id = $1', [target.id]);
          const nextMatch = targetRes.rows[0];
          if (nextMatch && (nextMatch.winner_id || nextMatch.status !== 'pending')) {
            await recursiveRollback(nextMatch.id, depth + 1);
          }
        }
      }

      // Swiss rounds after this one were paired from its result, so they go
      // (only in the match's own group for two-stage events).
      if (match.bracket === 'sw') {
        await client.query(`
          DELETE FROM axsuck.matches
          WHERE tournament_id = $1 AND bracket = 'sw' AND round > $2
            AND swiss_group IS NOT DISTINCT FROM $3
        `, [match.tournament_id, match.round, match.swiss_group ?? null]);
      }

      await recursiveRollback(matchId);
    });

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'match_rolled_back', matchId });

    return { success: true };
  });

  fastify.post('/tournaments/:id/matches/:matchId/score', async (req) => {
    requireAdmin(fastify, req);
    const { score1, score2 } = req.body;
    const match = await repo.getById(parseInt(req.params.matchId));
    if (!match) throw fastify.httpErrors.notFound('Match not found');
    await fastify.db.query(
      'UPDATE axsuck.matches SET score1 = $1, score2 = $2 WHERE id = $3',
      [score1 ?? 0, score2 ?? 0, match.id]
    );
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'score_updated', matchId: match.id });
    return { success: true };
  });

}
