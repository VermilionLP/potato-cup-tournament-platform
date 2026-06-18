import { MatchRepo } from '../repositories/match-repo.js';

export default async function matchesRoutes(fastify) {
  const repo = MatchRepo(fastify.db);

  fastify.post('/tournaments/:id/matches/:matchId/result', async (req) => {
    const { score1, score2 } = req.body;
    if (score1 == null || score2 == null) {
      throw fastify.httpErrors.badRequest('score1 and score2 are required');
    }
    const match = repo.getById(parseInt(req.params.matchId));
    if (!match) throw fastify.httpErrors.notFound('Match not found');

    const updated = repo.submitResult(match.id, score1, score2);

    const advanced = repo.advanceWinner(req.params.id, match.id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'match_result_submitted', matchId: match.id });

    return { match: updated, advanced };
  });

  fastify.post('/tournaments/:id/matches/:matchId/walkover', async (req) => {
    const { winner_id } = req.body;
    if (!winner_id) throw fastify.httpErrors.badRequest('winner_id is required');

    const match = repo.getById(parseInt(req.params.matchId));
    if (!match) throw fastify.httpErrors.notFound('Match not found');

    const db = fastify.db;
    db.prepare(`
      UPDATE matches SET status = 'walkover', winner_id = ?, score1 = 0, score2 = 0
      WHERE id = ?
    `).run(winner_id, match.id);

    const updated = repo.getById(match.id);
    const advanced = repo.advanceWinner(req.params.id, match.id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'match_walkover_submitted', matchId: match.id });

    return { match: updated, advanced };
  });

  fastify.post('/tournaments/:id/matches/manual', async (req) => {
    const { round, position, player1_id, player2_id } = req.body;
    if (round == null || position == null) {
      throw fastify.httpErrors.badRequest('round and position are required');
    }
    const match = repo.create({
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
    repo.clearMatches(req.params.id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'matches_cleared' });

    return { success: true };
  });
}
