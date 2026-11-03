// Registering for an event and withdrawing (both re-seed by ladder rating
// unless an admin has set the seeds by hand), and checking in before it
// starts (lib/checkin.js).

import { PlayerRepo } from '../repositories/player-repo.js';
import { TournamentRepo } from '../repositories/tournament-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { isAdminRequest, requireSelfOrAdmin } from '../lib/admin.js';
import { requireContact } from '../lib/contact.js';
import { checkinState } from '../lib/checkin.js';
import { hasLadderLimit, ladderLimitProblem } from '../lib/ladder-limit.js';

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
    // Ladder limit: players signing up themselves; admins can add anyone.
    if (hasLadderLimit(t) && !isAdminRequest(req)) {
      const problem = ladderLimitProblem(t, await ladderRepo.limitStanding(t, player_id));
      if (problem) throw fastify.httpErrors.forbidden(problem);
    }
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

  // Check in (or take it back) before the start. Players only while check-in
  // is open; admins any time during registration, for anyone.
  async function checkin(req, checkedIn) {
    const playerId = String(req.body?.player_id || '').trim();
    if (!playerId) throw fastify.httpErrors.badRequest('player_id is required');
    await requireSelfOrAdmin(fastify, req, playerId);
    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (!t.checkin_enabled) throw fastify.httpErrors.badRequest('这场赛事不需要签到');
    if (t.status !== 'registration') throw fastify.httpErrors.badRequest('赛事已开始，签到已结束');
    if (!isAdminRequest(req) && !checkinState(t).open) {
      throw fastify.httpErrors.badRequest('签到将在开赛前 30 分钟开放');
    }
    const res = await fastify.db.query(`
      UPDATE axsuck.tournament_players SET checked_in_at = ${checkedIn ? 'COALESCE(checked_in_at, NOW())' : 'NULL'}
      WHERE tournament_id = $1 AND player_id = $2
      RETURNING checked_in_at
    `, [req.params.id, playerId]);
    if (!res.rowCount) throw fastify.httpErrors.badRequest('该选手没有报名这场赛事');
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: checkedIn ? 'player_checked_in' : 'player_checkin_undone', player_id: playerId });
    return { player_id: playerId, checked_in_at: res.rows[0].checked_in_at };
  }

  fastify.post('/tournaments/:id/checkin', (req) => checkin(req, true));
  fastify.delete('/tournaments/:id/checkin', (req) => checkin(req, false));
}
