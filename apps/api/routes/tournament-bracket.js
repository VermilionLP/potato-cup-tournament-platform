// Seeds, bracket generation, the live match and the OBS overlay state.

import { TournamentRepo } from '../repositories/tournament-repo.js';
import { MatchRepo } from '../repositories/match-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { requireAdmin } from '../lib/admin.js';

export default async function tournamentBracketRoutes(fastify) {
  const repo = TournamentRepo(fastify.db);
  const matches = MatchRepo(fastify.db);
  const ladderRepo = LadderRepo(fastify.db);

  fastify.post('/tournaments/:id/overlay-state', async (req) => {
    requireAdmin(fastify, req);
    const { overlay_scene, overlay_round, overlay_stage } = req.body;
    const valid = ['auto', 'intro', 'ingame', 'intermission', 'hybrid'];
    if (overlay_scene && !valid.includes(overlay_scene)) throw fastify.httpErrors.badRequest('Invalid overlay_scene');
    if (overlay_stage && !/^(main|wb|lb|gf|sw|gse|gwb|glb):\d{1,3}$/.test(String(overlay_stage))) {
      throw fastify.httpErrors.badRequest('Invalid overlay_stage');
    }
    
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');

    const updated = await repo.updateOverlayState(req.params.id, overlay_scene, overlay_round, overlay_stage);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'overlay_state_updated', overlay_scene, overlay_round, overlay_stage });

    return updated;
  });

  fastify.post('/tournaments/:id/seeds', async (req) => {
    requireAdmin(fastify, req);
    const { player_ids } = req.body;
    if (!Array.isArray(player_ids)) throw fastify.httpErrors.badRequest('player_ids array required');
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    await repo.setSeeds(req.params.id, player_ids);
    await ladderRepo.setSeedMode(req.params.id, 'manual');
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    
    return await repo.getPlayers(req.params.id);
  });

  fastify.post('/tournaments/:id/seeds/auto', async (req) => {
    requireAdmin(fastify, req);
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const seeded = await ladderRepo.autoSeeds(req.params.id);
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    return seeded;
  });

  fastify.post('/tournaments/:id/seeds/randomize', async (req) => {
    requireAdmin(fastify, req);
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const body = req.body || {};
    const options = {};
    if (body.band != null && Number.isFinite(Number(body.band))) {
      options.band = Math.max(0, Math.min(400, Number(body.band)));
    }
    if (body.keep_top != null && Number.isFinite(Number(body.keep_top))) {
      options.keepTop = Math.max(0, Math.min(8, Number(body.keep_top)));
    }
    if (body.keep_bottom != null && Number.isFinite(Number(body.keep_bottom))) {
      options.keepBottom = Math.max(0, Math.min(8, Number(body.keep_bottom)));
    }
    const seeded = await ladderRepo.randomizeSeeds(req.params.id, options);
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    return seeded;
  });

  fastify.post('/tournaments/:id/bracket', async (req) => {
    requireAdmin(fastify, req);
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    let bracket;
    try {
      bracket = await matches.generateBracket(req.params.id);
    } catch (err) {
      if (/至少需要|at least/.test(err.message)) {
        throw fastify.httpErrors.badRequest(err.message);
      }
      throw err;
    }
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'bracket_generated' });
    
    return bracket;
  });

  fastify.get('/tournaments/:id/bracket', async (req) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return await matches.getByTournament(req.params.id);
  });

  fastify.post('/tournaments/:id/active-match', async (req) => {
    requireAdmin(fastify, req);
    const { active_match_id } = req.body;
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    
    await fastify.db.query(`
      UPDATE axsuck.tournaments SET active_match_id = $1 WHERE id = $2
    `, [active_match_id || null, req.params.id]);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'active_match_updated', active_match_id });

    return await repo.getById(req.params.id);
  });
}
