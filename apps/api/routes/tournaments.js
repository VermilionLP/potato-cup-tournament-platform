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

  fastify.get('/tournaments/:id/stream', (req, reply) => {
    const { id: tournamentId } = req.params;
    
    reply.hijack();
    
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });
    
    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 20000);

    const listener = (data) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    fastify.tournamentEvents.on(`update:${tournamentId}`, listener);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      fastify.tournamentEvents.off(`update:${tournamentId}`, listener);
    });
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
    const updated = repo.updateStatus(req.params.id, status, scheduled_time);
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'status_changed', status });
    
    return updated;
  });

  fastify.post('/tournaments/:id/seeds', async (req) => {
    const { player_ids } = req.body;
    if (!Array.isArray(player_ids)) throw fastify.httpErrors.badRequest('player_ids array required');
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    repo.setSeeds(req.params.id, player_ids);
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    
    return repo.getPlayers(req.params.id);
  });

  fastify.post('/tournaments/:id/bracket', async (req) => {
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const bracket = matches.generateBracket(req.params.id);
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'bracket_generated' });
    
    return bracket;
  });

  fastify.get('/tournaments/:id/bracket', async (req) => {
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return matches.getByTournament(req.params.id);
  });
}
