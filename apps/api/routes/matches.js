import { MatchRepo } from '../repositories/match-repo.js';

export default async function matchesRoutes(fastify) {
  const repo = MatchRepo(fastify.db);

  fastify.post('/tournaments/:id/matches/:matchId/result', async (req) => {
    const { score1, score2 } = req.body;
    if (score1 == null || score2 == null) {
      throw fastify.httpErrors.badRequest('score1 and score2 are required');
    }
    const match = await repo.getById(parseInt(req.params.matchId));
    if (!match) throw fastify.httpErrors.notFound('Match not found');

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
    await repo.clearMatches(req.params.id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'matches_cleared' });

    return { success: true };
  });

  fastify.post('/tournaments/:id/matches/:matchId/rollback', async (req) => {
    const matchId = parseInt(req.params.matchId);
    const match = await repo.getById(matchId);
    if (!match) throw fastify.httpErrors.notFound('Match not found');

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      async function recursiveRollback(mId) {
        const mRes = await client.query('SELECT * FROM axsuck.matches WHERE id = $1', [mId]);
        const m = mRes.rows[0];
        if (!m) return;

        await client.query(`
          UPDATE axsuck.matches SET score1 = 0, score2 = 0, winner_id = NULL, status = 'pending'
          WHERE id = $1
        `, [mId]);

        const nextRound = m.round - 1;
        if (nextRound >= 1) {
          const nextPosition = Math.ceil(m.position / 2);
          const nextRes = await client.query(`
            SELECT * FROM axsuck.matches WHERE tournament_id = $1 AND round = $2 AND position = $3
          `, [m.tournament_id, nextRound, nextPosition]);
          const nextMatch = nextRes.rows[0];

          if (nextMatch) {
            const isPlayer1 = m.position % 2 === 1;
            if (isPlayer1) {
              await client.query('UPDATE axsuck.matches SET player1_id = NULL WHERE id = $1', [nextMatch.id]);
            } else {
              await client.query('UPDATE axsuck.matches SET player2_id = NULL WHERE id = $1', [nextMatch.id]);
            }

            if (nextMatch.status === 'completed' || nextMatch.status === 'walkover' || nextMatch.winner_id) {
              await recursiveRollback(nextMatch.id);
            }
          }
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
