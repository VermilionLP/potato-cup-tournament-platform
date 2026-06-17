import { PlayerRepo } from '../repositories/player-repo.js';
import { TournamentRepo } from '../repositories/tournament-repo.js';

export default async function playersRoutes(fastify) {
  const repo = PlayerRepo(fastify.db);
  const tourneyRepo = TournamentRepo(fastify.db);

  fastify.get('/players', async () => {
    return repo.list();
  });

  fastify.get('/players/:id', async (req) => {
    const p = repo.getById(req.params.id);
    if (!p) throw fastify.httpErrors.notFound('Player not found');
    return {
      ...p,
      tournaments: repo.getTournaments(req.params.id)
    };
  });

  fastify.post('/players', async (req) => {
    const { id, display_name } = req.body;
    if (!id) throw fastify.httpErrors.badRequest('id is required');
    return repo.upsert(id, display_name || id);
  });

  fastify.post('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');

    const t = tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.status !== 'registration') throw fastify.httpErrors.badRequest('Registration is closed');

    repo.upsert(player_id, player_id);
    const added = tourneyRepo.addPlayer(req.params.id, player_id);
    if (!added) throw fastify.httpErrors.conflict('Already registered');
    return tourneyRepo.getPlayers(req.params.id);
  });

  fastify.delete('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    tourneyRepo.removePlayer(req.params.id, player_id);
    return { success: true };
  });
}
