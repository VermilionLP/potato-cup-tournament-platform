import { MatchRepo } from '../repositories/match-repo.js';
import { requireAdmin, requireMatchPlayerOrAdmin } from '../lib/admin.js';

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

  fastify.post('/tournaments/:id/matches/:matchId/result', async (req) => {
    const { score1, score2 } = req.body;
    if (score1 == null || score2 == null) {
      throw fastify.httpErrors.badRequest('score1 and score2 are required');
    }
    const match = await repo.getById(parseInt(req.params.matchId));
    if (!match) throw fastify.httpErrors.notFound('Match not found');
    if (match.tournament_id !== req.params.id) {
      throw fastify.httpErrors.notFound('Match not found in this tournament');
    }
    requireMatchPlayerOrAdmin(fastify, req, match);
    await rejectGroupEditDuringPlayoffs(match);

    const updated = await repo.submitResult(match.id, score1, score2);
    const advanced = await repo.advanceWinner(req.params.id, match.id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'match_result_submitted', matchId: match.id });

    return { match: updated, advanced };
  });

  fastify.post('/tournaments/:id/matches/:matchId/walkover', async (req) => {
    const { winner_id } = req.body;
    if (!winner_id) throw fastify.httpErrors.badRequest('winner_id is required');

    const match = await repo.getById(parseInt(req.params.matchId));
    if (!match) throw fastify.httpErrors.notFound('Match not found');
    if (match.tournament_id !== req.params.id) {
      throw fastify.httpErrors.notFound('Match not found in this tournament');
    }
    requireMatchPlayerOrAdmin(fastify, req, match);
    await rejectGroupEditDuringPlayoffs(match);
    if (winner_id !== match.player1_id && winner_id !== match.player2_id) {
      throw fastify.httpErrors.badRequest('winner_id must be one of the match players');
    }

    await fastify.db.query(`
      UPDATE axsuck.matches SET status = 'walkover', winner_id = $1, score1 = 0, score2 = 0
      WHERE id = $2
    `, [winner_id, match.id]);

    const updated = await repo.getById(match.id);
    const advanced = await repo.advanceWinner(req.params.id, match.id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'match_walkover_submitted', matchId: match.id });

    return { match: updated, advanced };
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

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

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
            await client.query('DELETE FROM axsuck.matches WHERE id = $1', [reset.id]);
            await client.query(`
              UPDATE axsuck.tournaments SET active_match_id = NULL
              WHERE id = $1 AND active_match_id = $2
            `, [m.tournament_id, reset.id]);
          }
        }

        await client.query(`
          UPDATE axsuck.matches SET score1 = 0, score2 = 0, winner_id = NULL, status = 'pending'
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
        const later = await client.query(`
          DELETE FROM axsuck.matches
          WHERE tournament_id = $1 AND bracket = 'sw' AND round > $2
            AND swiss_group IS NOT DISTINCT FROM $3
          RETURNING id
        `, [match.tournament_id, match.round, match.swiss_group ?? null]);
        const removed = later.rows.map((r) => r.id);
        if (removed.length > 0) {
          await client.query(`
            UPDATE axsuck.tournaments SET active_match_id = NULL
            WHERE id = $1 AND active_match_id = ANY($2::int[])
          `, [match.tournament_id, removed]);
        }
      }

      await recursiveRollback(matchId);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

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
