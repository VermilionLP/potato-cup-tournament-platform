import { VoteRepo } from '../repositories/vote-repo.js';
import { CustomVoteRepo } from '../repositories/custom-vote-repo.js';
import { TournamentRepo } from '../repositories/tournament-repo.js';
import { PlayerRepo } from '../repositories/player-repo.js';
import { requireAdmin, requireSelfOrAdmin } from '../lib/admin.js';
import { requireContact } from '../lib/contact.js';

export default async function votesRoutes(fastify) {
  const repo = VoteRepo(fastify.db);
  const customRepo = CustomVoteRepo(fastify.db);
  const tourneyRepo = TournamentRepo(fastify.db);
  const playerRepo = PlayerRepo(fastify.db);

  fastify.get('/tournaments/:id/votes', async (req) => {
    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return await repo.getByTournament(req.params.id);
  });

  fastify.post('/tournaments/:id/vote', async (req) => {
    const { player_id, proposed_time } = req.body;
    if (!player_id || !proposed_time) {
      throw fastify.httpErrors.badRequest('player_id and proposed_time are required');
    }
    await requireSelfOrAdmin(fastify, req, player_id);
    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.status !== 'voting' && t.status !== 'registration') {
      throw fastify.httpErrors.badRequest('Voting is not open');
    }
    const existingPlayer = await playerRepo.getById(player_id);
    requireContact(fastify, req, existingPlayer);
    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    const lastIp = (requesterId === player_id) ? req.ip : null;

    if (!existingPlayer) {
      await playerRepo.upsert(player_id, 'cn', '', '', '{}', lastIp);
    } else {
      if (requesterId === player_id) {
        await fastify.db.query('UPDATE axsuck.players SET last_ip = $1, last_seen_at = NOW() WHERE id = $2', [req.ip, player_id]);
      }
    }
    const result = await repo.upsert(req.params.id, player_id, proposed_time);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'vote_submitted', player_id, proposed_time });

    return result;
  });

  fastify.delete('/tournaments/:id/votes/past', async (req) => {
    requireAdmin(fastify, req);
    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const deleted = await repo.deletePast(req.params.id);
    if (deleted > 0) {
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'past_votes_removed', deleted });
    }
    return { deleted };
  });

  fastify.delete('/tournaments/:id/vote', async (req) => {
    const { player_id, proposed_time } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    await requireSelfOrAdmin(fastify, req, player_id);
    await repo.removeVote(req.params.id, player_id, proposed_time || null);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'vote_removed', player_id });

    return await repo.getByTournament(req.params.id);
  });

  fastify.post('/tournaments/:id/custom-vote', async (req) => {
    const { player_id, topic, value } = req.body;
    if (!player_id || !topic || !value) {
      throw fastify.httpErrors.badRequest('player_id, topic and value are required');
    }
    await requireSelfOrAdmin(fastify, req, player_id);
    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.status !== 'voting' && t.status !== 'registration') {
      throw fastify.httpErrors.badRequest('Voting is not open');
    }
    const existingPlayer = await playerRepo.getById(player_id);
    requireContact(fastify, req, existingPlayer);
    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    const lastIp = (requesterId === player_id) ? req.ip : null;

    if (!existingPlayer) {
      await playerRepo.upsert(player_id, 'cn', '', '', '{}', lastIp);
    } else {
      if (requesterId === player_id) {
        await fastify.db.query('UPDATE axsuck.players SET last_ip = $1, last_seen_at = NOW() WHERE id = $2', [req.ip, player_id]);
      }
    }
    const result = await customRepo.upsert(req.params.id, player_id, topic, value);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'custom_vote_submitted', player_id, topic, value });

    return result;
  });

  fastify.delete('/tournaments/:id/custom-vote', async (req) => {
    const { player_id, topic, value } = req.body;
    if (!player_id || !topic || !value) {
      throw fastify.httpErrors.badRequest('player_id, topic and value are required');
    }
    await requireSelfOrAdmin(fastify, req, player_id);
    await customRepo.removeVote(req.params.id, player_id, topic, value);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'custom_vote_removed', player_id, topic, value });

    return { success: true };
  });
}
