import { TournamentRepo } from '../repositories/tournament-repo.js';
import { MatchRepo } from '../repositories/match-repo.js';

export default async function tournamentsRoutes(fastify) {
  const repo = TournamentRepo(fastify.db);
  const matches = MatchRepo(fastify.db);

  fastify.get('/tournaments', async () => {
    return repo.list();
  });

  fastify.get('/tournaments/:id', async (req) => {
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return {
      ...t,
      players: repo.getPlayers(req.params.id),
      matches: repo.getMatches(req.params.id),
      votes: repo.getVotes(req.params.id)
    };
  });

  fastify.post('/tournaments', async (req) => {
    const { id, name, description, player_capacity, hold_third_place } = req.body;
    if (!id || !name) throw fastify.httpErrors.badRequest('id and name are required');
    const existing = repo.getById(id);
    if (existing) throw fastify.httpErrors.conflict('Tournament ID already exists');
    return repo.create({ id, name, description, player_capacity, hold_third_place });
  });

  fastify.post('/tournaments/:id/status', async (req) => {
    const { status, scheduled_time } = req.body;
    const valid = ['registration', 'voting', 'in_progress', 'completed'];
    if (!valid.includes(status)) throw fastify.httpErrors.badRequest('Invalid status');
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return repo.updateStatus(req.params.id, status, scheduled_time);
  });

  fastify.post('/tournaments/:id/seeds', async (req) => {
    const { player_ids } = req.body;
    if (!Array.isArray(player_ids)) throw fastify.httpErrors.badRequest('player_ids array required');
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    repo.setSeeds(req.params.id, player_ids);
    return repo.getPlayers(req.params.id);
  });

  fastify.post('/tournaments/:id/bracket', async (req) => {
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const bracket = matches.generateBracket(req.params.id);
    return bracket;
  });

  fastify.get('/tournaments/:id/bracket', async (req) => {
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return matches.getByTournament(req.params.id);
  });
}
