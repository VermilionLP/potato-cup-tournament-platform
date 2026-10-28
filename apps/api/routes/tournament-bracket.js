// Seeds, bracket generation, and each live channel's match and OBS overlay
// state.

import { TournamentRepo } from '../repositories/tournament-repo.js';
import { MatchRepo } from '../repositories/match-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { requireAdmin } from '../lib/admin.js';
import { LiveChannelRepo } from '../repositories/live-channel-repo.js';
import { MAX_LIVE_CHANNELS, OVERLAY_SCENES, OVERLAY_STAGE_RE, parseChannel } from '../lib/live-channels.js';

export default async function tournamentBracketRoutes(fastify) {
  const repo = TournamentRepo(fastify.db);
  const matches = MatchRepo(fastify.db);
  const ladderRepo = LadderRepo(fastify.db);
  const channels = LiveChannelRepo(fastify.db);

  // Live state is per channel (body.channel, default 1): several referees
  // can run streams of the same event side by side.
  function channelOf(req) {
    const channel = parseChannel(req.body?.channel);
    if (channel === null) throw fastify.httpErrors.badRequest(`channel must be 1-${MAX_LIVE_CHANNELS}`);
    return channel;
  }

  fastify.post('/tournaments/:id/overlay-state', async (req) => {
    requireAdmin(fastify, req);
    const { overlay_scene, overlay_round, overlay_stage } = req.body || {};
    if (overlay_scene && !OVERLAY_SCENES.includes(overlay_scene)) throw fastify.httpErrors.badRequest('Invalid overlay_scene');
    if (overlay_stage && !OVERLAY_STAGE_RE.test(String(overlay_stage))) {
      throw fastify.httpErrors.badRequest('Invalid overlay_stage');
    }
    const channel = channelOf(req);
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');

    const state = await channels.setOverlay(req.params.id, channel, overlay_scene, overlay_round, overlay_stage);
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'overlay_state_updated', channel, overlay_scene, overlay_round, overlay_stage });
    return state;
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
    const channel = channelOf(req);
    const raw = req.body?.active_match_id;
    const matchId = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (matchId !== null && !Number.isInteger(matchId)) throw fastify.httpErrors.badRequest('Invalid active_match_id');
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');

    const result = await channels.setActiveMatch(req.params.id, channel, matchId);
    if (result.notFound) throw fastify.httpErrors.notFound('Match not found in this tournament');
    if (result.conflict) throw fastify.httpErrors.conflict(`该对局已在频道 ${result.conflict} 直播`);

    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'active_match_updated', channel, active_match_id: matchId });
    return result.channel;
  });
}
