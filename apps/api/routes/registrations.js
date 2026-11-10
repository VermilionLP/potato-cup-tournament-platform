// Registering for an event and withdrawing (both re-seed by ladder rating
// unless an admin has set the seeds by hand), and checking in before it
// starts (lib/checkin.js).

import { TournamentRepo } from '../repositories/tournament-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { isAdminRequest, requireSelfOrAdmin } from '../lib/admin.js';
import { hasLadderLimit, ladderLimitProblem } from '../lib/ladder-limit.js';
import { registerPlayer, setCheckin, unregisterPlayer } from '../lib/registration.js';

export default async function registrationRoutes(fastify) {
  const tourneyRepo = TournamentRepo(fastify.db);
  const ladderRepo = LadderRepo(fastify.db);

  fastify.post('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    await requireSelfOrAdmin(fastify, req, player_id);
    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    await registerPlayer(fastify, {
      tournamentId: req.params.id,
      playerId: player_id,
      admin: isAdminRequest(req),
      seenIp: requesterId === player_id ? req.ip : null,
    });
    return await tourneyRepo.getPlayers(req.params.id);
  });

  // Whether a player may sign up under the event's ladder limit, with their
  // standing in its division, so the page can say so before they try.
  fastify.get('/tournaments/:id/ladder-eligibility', async (req) => {
    const playerId = String(req.query?.player_id || '');
    if (!playerId) throw fastify.httpErrors.badRequest('player_id is required');
    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (!hasLadderLimit(t)) return { limited: false, problem: null };
    const standing = await ladderRepo.limitStanding(t, playerId);
    return {
      limited: true,
      problem: ladderLimitProblem(t, standing),
      mmr: standing?.mmr ?? null,
      games: standing?.games ?? 0,
      tier: standing?.tier?.name ?? null,
    };
  });

  fastify.delete('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    await requireSelfOrAdmin(fastify, req, player_id);
    await unregisterPlayer(fastify, { tournamentId: req.params.id, playerId: player_id });
    return { success: true };
  });

  // Check in (or take it back) before the start (lib/registration.js).
  async function checkin(req, checkedIn) {
    const playerId = String(req.body?.player_id || '').trim();
    if (!playerId) throw fastify.httpErrors.badRequest('player_id is required');
    await requireSelfOrAdmin(fastify, req, playerId);
    return setCheckin(fastify, { tournamentId: req.params.id, playerId, checkedIn, admin: isAdminRequest(req) });
  }

  fastify.post('/tournaments/:id/checkin', (req) => checkin(req, true));
  fastify.delete('/tournaments/:id/checkin', (req) => checkin(req, false));
}
