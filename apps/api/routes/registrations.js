// Registering for an event and withdrawing; both re-seed by ladder rating
// unless an admin has set the seeds by hand.

import { PlayerRepo } from '../repositories/player-repo.js';
import { TournamentRepo } from '../repositories/tournament-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { requireSelfOrAdmin } from '../lib/admin.js';
import { requireContact } from '../lib/contact.js';

export default async function registrationRoutes(fastify) {
  const repo = PlayerRepo(fastify.db);
  const tourneyRepo = TournamentRepo(fastify.db);
  const ladderRepo = LadderRepo(fastify.db);

  fastify.post('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    await requireSelfOrAdmin(fastify, req, player_id);

    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.status !== 'registration') throw fastify.httpErrors.badRequest('Registration is closed');

    const existingPlayer = await repo.getById(player_id);
    requireContact(fastify, req, existingPlayer);
    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    const lastIp = (requesterId === player_id) ? req.ip : null;

    if (!existingPlayer) {
      await repo.upsert(player_id, 'cn', '', '', '{}', lastIp);
    } else {
      if (requesterId === player_id) {
        await fastify.db.query('UPDATE axsuck.players SET last_ip = $1, last_seen_at = NOW() WHERE id = $2', [req.ip, player_id]);
      }
    }
    const added = await tourneyRepo.addPlayer(req.params.id, player_id);
    if (!added) throw fastify.httpErrors.conflict('Already registered');

    // Registration defaults to ladder-ordered seeds; manual seed edits opt out.
    if (t.seed_mode !== 'manual') {
      await ladderRepo.autoSeeds(req.params.id);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    }

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'player_registered', player_id });

    return await tourneyRepo.getPlayers(req.params.id);
  });

  fastify.delete('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    await requireSelfOrAdmin(fastify, req, player_id);
    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    await tourneyRepo.removePlayer(req.params.id, player_id);

    if (t.seed_mode !== 'manual') {
      await ladderRepo.autoSeeds(req.params.id);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    }

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'player_unregistered', player_id });

    return { success: true };
  });
}
