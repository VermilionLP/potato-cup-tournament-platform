import { VoteRepo } from '../repositories/vote-repo.js';
import { CustomVoteRepo } from '../repositories/custom-vote-repo.js';
import { TournamentRepo } from '../repositories/tournament-repo.js';
import { PlayerRepo } from '../repositories/player-repo.js';

export default async function votesRoutes(fastify) {
  const repo = VoteRepo(fastify.db);
  const customRepo = CustomVoteRepo(fastify.db);
  const tourneyRepo = TournamentRepo(fastify.db);
  const playerRepo = PlayerRepo(fastify.db);

  fastify.get('/tournaments/:id/votes', async (req) => {
    const t = tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return repo.getByTournament(req.params.id);
  });

  fastify.post('/tournaments/:id/vote', async (req) => {
    const { player_id, proposed_time } = req.body;
    if (!player_id || !proposed_time) {
      throw fastify.httpErrors.badRequest('player_id and proposed_time are required');
    }
    const t = tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.status !== 'voting' && t.status !== 'registration') {
      throw fastify.httpErrors.badRequest('Voting is not open');
    }
    const existingPlayer = playerRepo.getById(player_id);
    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    const lastIp = (requesterId === player_id) ? req.ip : null;

    if (!existingPlayer) {
      playerRepo.upsert(player_id, 'cn', '', '', '{}', lastIp);
    } else {
      if (requesterId === player_id) {
        fastify.db.prepare('UPDATE players SET last_ip = ? WHERE id = ?').run(req.ip, player_id);
      }
    }
    const result = repo.upsert(req.params.id, player_id, proposed_time);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'vote_submitted', player_id, proposed_time });

    return result;
  });

  fastify.delete('/tournaments/:id/vote', async (req) => {
    const { player_id, proposed_time } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    repo.removeVote(req.params.id, player_id, proposed_time || null);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'vote_removed', player_id });

    return repo.getByTournament(req.params.id);
  });

  fastify.post('/tournaments/:id/custom-vote', async (req) => {
    const { player_id, topic, value } = req.body;
    if (!player_id || !topic || !value) {
      throw fastify.httpErrors.badRequest('player_id, topic and value are required');
    }
    const t = tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.status !== 'voting' && t.status !== 'registration') {
      throw fastify.httpErrors.badRequest('Voting is not open');
    }
    const existingPlayer = playerRepo.getById(player_id);
    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    const lastIp = (requesterId === player_id) ? req.ip : null;

    if (!existingPlayer) {
      playerRepo.upsert(player_id, 'cn', '', '', '{}', lastIp);
    } else {
      if (requesterId === player_id) {
        fastify.db.prepare('UPDATE players SET last_ip = ? WHERE id = ?').run(req.ip, player_id);
      }
    }
    const result = customRepo.upsert(req.params.id, player_id, topic, value);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'custom_vote_submitted', player_id, topic, value });

    return result;
  });

  fastify.delete('/tournaments/:id/custom-vote', async (req) => {
    const { player_id, topic, value } = req.body;
    if (!player_id || !topic || !value) {
      throw fastify.httpErrors.badRequest('player_id, topic and value are required');
    }
    customRepo.removeVote(req.params.id, player_id, topic, value);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'custom_vote_removed', player_id, topic, value });

    return { success: true };
  });
}
