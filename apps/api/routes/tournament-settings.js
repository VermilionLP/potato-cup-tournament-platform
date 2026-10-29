// Event settings and stages: rename / time / type / template / points
// (PATCH), status changes, Swiss round count, and the playoff of two-stage
// events.

import { TournamentRepo } from '../repositories/tournament-repo.js';
import { MatchRepo } from '../repositories/match-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { requireAdmin } from '../lib/admin.js';
import { normalizePointsKind, normalizePointsTable, normalizeSeason } from '../lib/points.js';
import { endedSeason } from '../lib/points-seasons.js';
import { groupStageOf } from '../lib/group-stage-view.js';
import { GAME_MODES, startBlockedReason, VEHICLE_POOLS } from '../lib/tournament-config.js';
import { EVENT_KINDS, EVENT_TIERS, normalizeKind, normalizeTier } from '../lib/event-tier.js';
import {
  currentSwissRound,
  effectiveSwissRounds,
  isAutoRounds,
  MAX_SWISS_ROUNDS,
  MIN_SWISS_ROUNDS,
  parseSwissRounds,
  SWISS_BRACKET,
} from '../lib/swiss.js';

export default async function tournamentSettingsRoutes(fastify) {
  const repo = TournamentRepo(fastify.db);
  const matches = MatchRepo(fastify.db);
  const ladderRepo = LadderRepo(fastify.db);

  // Rename and/or move the match time. The time can be changed once the
  // voting phase is over (voting sets it when registration opens).
  fastify.patch('/tournaments/:id', async (req) => {
    requireAdmin(fastify, req);
    const body = req.body || {};
    const hasName = body.name !== undefined;
    const hasTime = body.scheduled_time !== undefined;
    const hasPool = body.vehicle_pool !== undefined;
    const hasTemplate = body.vehicle_template !== undefined;
    const hasPoints = body.points_table !== undefined;
    const hasInvite = body.points_invite !== undefined;
    const hasTier = body.tier !== undefined || body.event_kind !== undefined;
    const hasMode = body.game_mode !== undefined;
    if (!hasName && !hasTime && !hasPool && !hasTemplate && !hasPoints && !hasInvite && !hasTier && !hasMode) {
      throw fastify.httpErrors.badRequest('name, scheduled_time, game_mode, vehicle_pool, vehicle_template, points_table, points_invite, tier or event_kind is required');
    }
    if (hasMode && !GAME_MODES.includes(String(body.game_mode))) {
      throw fastify.httpErrors.badRequest(`game_mode must be one of: ${GAME_MODES.join(', ')}`);
    }
    if (body.tier && !normalizeTier(body.tier)) {
      throw fastify.httpErrors.badRequest(`tier must be one of: ${EVENT_TIERS.join(', ')}`);
    }
    if (body.event_kind && !normalizeKind(body.event_kind)) {
      throw fastify.httpErrors.badRequest(`event_kind must be one of: ${EVENT_KINDS.join(', ')}`);
    }
    const points = hasPoints ? normalizePointsTable(body.points_table) : null;
    if (points?.error) throw fastify.httpErrors.badRequest(points.error);
    if (points?.table && !normalizeSeason(body.points_season)) {
      throw fastify.httpErrors.badRequest('请填写积分榜赛季（年份，如 2026）');
    }
    if (hasPool && !VEHICLE_POOLS.includes(String(body.vehicle_pool))) {
      throw fastify.httpErrors.badRequest(`vehicle_pool must be one of: ${VEHICLE_POOLS.join(', ')}`);
    }
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (hasInvite && !hasPoints && !t.points_table?.length) {
      throw fastify.httpErrors.badRequest('这场赛事不计入积分榜，不能设置直邀名额');
    }
    if (hasPoints || hasInvite) {
      const locked = await endedSeason(fastify.db, t.points_season, hasPoints ? normalizeSeason(body.points_season) : null);
      if (locked) throw fastify.httpErrors.badRequest(`${locked} 赛季已结束，积分和直邀已锁定`);
    }

    let updated = t;
    if (hasName) {
      const name = String(body.name || '').trim();
      if (!name) throw fastify.httpErrors.badRequest('name is required');
      updated = await repo.rename(req.params.id, name);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'name_changed', name });
    }
    // Points can be set or changed at any time, finished events included.
    if (hasPoints) {
      updated = await repo.setPoints(
        req.params.id,
        points.table,
        normalizeSeason(body.points_season),
        normalizePointsKind(body.points_kind),
        hasInvite ? Boolean(body.points_invite) : null,
      );
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'points_changed' });
    }
    if (hasInvite && !hasPoints) {
      updated = await repo.setPointsInvite(req.params.id, body.points_invite);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'points_changed' });
    }
    // Tier and kind can be changed at any time; a field left out stays.
    if (hasTier) {
      const tier = body.tier === undefined ? t.tier : normalizeTier(body.tier);
      const kind = body.event_kind === undefined ? t.event_kind : normalizeKind(body.event_kind);
      updated = await repo.setTier(req.params.id, tier, kind);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'tier_changed', tier, event_kind: kind });
    }
    // The game mode too (it picks the ladder division and the vehicle pool
    // template), finished events included.
    if (hasMode) {
      updated = await repo.setGameMode(req.params.id, body.game_mode);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'game_mode_changed', game_mode: updated.game_mode });
    }
    // The event type can be changed at any time, finished events included.
    if (hasPool) {
      updated = await repo.setVehiclePool(req.params.id, body.vehicle_pool);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'vehicle_pool_changed', vehicle_pool: updated.vehicle_pool });
    }
    // Vehicle pool template for Ban / Pick: an id, or null / "" for automatic.
    if (hasTemplate) {
      const template = body.vehicle_template ? String(body.vehicle_template) : null;
      if (template) {
        const exists = await fastify.db.query('SELECT 1 FROM axsuck.vehicle_pools WHERE id = $1', [template]);
        if (!exists.rowCount) throw fastify.httpErrors.badRequest('载具池模板不存在');
      }
      updated = await repo.setVehicleTemplate(req.params.id, template);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'vehicle_template_changed', vehicle_template: template });
    }
    if (hasTime) {
      const time = String(body.scheduled_time || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)) {
        throw fastify.httpErrors.badRequest('比赛时间格式应为 YYYY-MM-DDTHH:mm');
      }
      if (t.status === 'voting') throw fastify.httpErrors.badRequest('时间投票进行中，请通过「确定比赛时间」开启报名');
      if (t.status === 'completed') throw fastify.httpErrors.badRequest('赛事已结束，不能修改比赛时间');
      updated = await repo.setScheduledTime(req.params.id, time);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'time_changed', scheduled_time: time });
    }
    return updated;
  });

  fastify.post('/tournaments/:id/status', async (req) => {
    requireAdmin(fastify, req);
    const { status, scheduled_time, created_at, updated_at } = req.body;
    const valid = ['registration', 'voting', 'in_progress', 'completed'];
    if (!valid.includes(status)) throw fastify.httpErrors.badRequest('Invalid status');
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const wasVoting = t.status === 'voting';

    if (status === 'in_progress' && t.status !== 'in_progress') {
      const reason = startBlockedReason(t.format, t.player_count, t.swiss_rounds, t.playoff_format ? {
        groupSize: t.swiss_group_size,
        perGroup: t.advance_per_group,
        playoffFormat: t.playoff_format,
      } : null);
      if (reason) throw fastify.httpErrors.badRequest(reason);
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      if (status === 'registration' || status === 'voting') {
        await client.query(`UPDATE axsuck.tournaments SET active_match_id = NULL, current_stage = 'group' WHERE id = $1`, [req.params.id]);
        await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [req.params.id]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await repo.updateStatus(req.params.id, status, scheduled_time, created_at, updated_at);

    let autoRegistered = [];
    if (wasVoting && status === 'registration') {
      try {
        autoRegistered = await repo.autoRegisterVoters(req.params.id, scheduled_time);
        if (autoRegistered.length > 0 && t.seed_mode !== 'manual') {
          await ladderRepo.autoSeeds(req.params.id);
        }
      } catch (err) {
        fastify.log.error({ err, tournament: req.params.id }, 'auto-register voters failed');
      }
    }

    const updated = await repo.getById(req.params.id);
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'status_changed', status });
    if (autoRegistered.length > 0) {
      fastify.tournamentEvents.emit(`update:${req.params.id}`, {
        type: 'players_auto_registered',
        player_ids: autoRegistered,
      });
    }
    
    return { ...updated, auto_registered: autoRegistered };
  });

  // Change the number of Swiss rounds. It cannot drop below the round already
  // being played; raising it after the last round finished starts the next one.
  fastify.post('/tournaments/:id/swiss-rounds', async (req) => {
    requireAdmin(fastify, req);
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.format !== 'swiss') throw fastify.httpErrors.badRequest('该赛事不是瑞士轮');
    if (t.status === 'completed') throw fastify.httpErrors.badRequest('赛事已结束，不能修改轮数');
    if (t.current_stage === 'playoff') throw fastify.httpErrors.badRequest('淘汰赛已开始，不能再修改小组赛轮数');
    // An empty value switches back to the automatic (round robin) count.
    const auto = isAutoRounds(req.body?.swiss_rounds);
    const rounds = auto ? null : parseSwissRounds(req.body?.swiss_rounds);
    if (!auto && !rounds) {
      throw fastify.httpErrors.badRequest(`轮数必须是 ${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS} 之间的整数（留空为自动）`);
    }
    const players = await repo.getPlayers(req.params.id);
    const swissMatches = (await repo.getMatches(req.params.id)).filter((m) => m.bracket === SWISS_BRACKET);
    const groupIds = [...new Set(players.map((p) => p.swiss_group || 1))];
    for (const g of groupIds) {
      const size = players.filter((p) => (p.swiss_group || 1) === g).length;
      const played = currentSwissRound(swissMatches.filter((m) => (m.swiss_group || 1) === g));
      const target = effectiveSwissRounds(rounds, size);
      if (target < played) {
        throw fastify.httpErrors.badRequest(`已经进行到第 ${played} 轮，轮数不能少于 ${played}`);
      }
    }
    const updated = await repo.setSwissRounds(req.params.id, rounds);
    if (t.status === 'in_progress') await matches.advanceSwiss(req.params.id);
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'swiss_rounds_changed', swiss_rounds: rounds });
    return updated;
  });

  // Two-stage events: build the playoff from the group-stage qualifiers.
  fastify.post('/tournaments/:id/playoffs', async (req) => {
    requireAdmin(fastify, req);
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (!t.playoff_format) throw fastify.httpErrors.badRequest('该赛事没有淘汰赛阶段');
    if (t.status !== 'in_progress') throw fastify.httpErrors.badRequest('赛事进行中才能进入淘汰赛');
    if (t.current_stage === 'playoff') throw fastify.httpErrors.badRequest('淘汰赛已经生成');
    const players = await repo.getPlayers(req.params.id);
    const stage = groupStageOf(t, players, await repo.getMatches(req.params.id));
    if (!stage.complete) throw fastify.httpErrors.badRequest('小组赛还没有全部打完');
    await matches.generatePlayoffs(req.params.id, stage.qualifiers.map((q) => q.player_id), t.playoff_format);
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'playoffs_generated' });
    return await repo.getById(req.params.id);
  });

  // Back to the group stage: deletes the playoff bracket and its results.
  fastify.delete('/tournaments/:id/playoffs', async (req) => {
    requireAdmin(fastify, req);
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.current_stage !== 'playoff') throw fastify.httpErrors.badRequest('淘汰赛还没有开始');
    if (t.status === 'completed') throw fastify.httpErrors.badRequest('赛事已结束，请先重新打开比赛');
    await matches.clearPlayoffs(req.params.id);
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'playoffs_cleared' });
    return { success: true };
  });
}
