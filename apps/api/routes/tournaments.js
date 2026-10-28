// Events: list, detail, live updates (SSE), calendars, create and delete.
// Settings and stages are in tournament-settings.js, seeds / bracket /
// overlay in tournament-bracket.js, imports in tournament-import.js.

import { TournamentRepo } from '../repositories/tournament-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { Readable } from 'stream';
import { buildCalendarFeed, buildTournamentIcs } from '../lib/calendar.js';
import { requireAdmin } from '../lib/admin.js';
import { normalizePointsKind, normalizePointsTable, normalizeSeason } from '../lib/points.js';
import { endedSeason } from '../lib/points-seasons.js';
import { tournamentDetail } from '../lib/tournament-detail.js';
import { GAME_MODES, SUPPORTED_FORMATS, VEHICLE_POOLS } from '../lib/tournament-config.js';
import { groupBracketProblem } from '../lib/group-brackets.js';
import { MAX_GROUP_SIZE, MIN_GROUP_SIZE, PLAYOFF_FORMATS } from '../lib/group-stage.js';
import { isAutoRounds, MAX_SWISS_ROUNDS, MIN_SWISS_ROUNDS, parseSwissRounds } from '../lib/swiss.js';

export default async function tournamentsRoutes(fastify) {
  const repo = TournamentRepo(fastify.db);
  const ladderRepo = LadderRepo(fastify.db);

  fastify.get('/tournaments', async () => {
    return await repo.list();
  });

  fastify.get('/tournaments/:id', async (req) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const [players, ms, votes, customVotes, ladder] = await Promise.all([
      repo.getPlayers(req.params.id),
      repo.getMatches(req.params.id),
      repo.getVotes(req.params.id),
      repo.getCustomVotes(req.params.id),
      ladderRepo.eventRatings(t),
    ]);
    return tournamentDetail(t, { players, matches: ms, votes, customVotes, ladder });
  });

  fastify.get('/tournaments/:id/stream', { sse: 'only' }, async (req, reply) => {
    const { id: tournamentId } = req.params;
    
    reply.headers({
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });

    const stream = new Readable({
      objectMode: true,
      read() {}
    });

    const listener = (data) => {
      stream.push({ data });
    };

    fastify.tournamentEvents.on(`update:${tournamentId}`, listener);

    req.raw.on('close', () => {
      fastify.tournamentEvents.off(`update:${tournamentId}`, listener);
      stream.push(null);
    });

    await reply.sse.send(stream);
  });

  fastify.post('/tournaments', async (req) => {
    requireAdmin(fastify, req);
    const {
      id,
      name,
      description,
      player_capacity,
      hold_third_place,
      loser_advances,
      scheduled_time,
      game_mode,
      vehicle_pool,
      format,
      grand_final_reset,
      swiss_rounds,
      banpick_enabled,
      playoff_format,
      swiss_group_size,
      advance_per_group,
      points_table,
      points_season,
      points_kind,
      points_invite,
    } = req.body;
    const points = normalizePointsTable(points_table);
    if (points.error) throw fastify.httpErrors.badRequest(points.error);
    if (points.table && !normalizeSeason(points_season)) {
      throw fastify.httpErrors.badRequest('请填写积分榜赛季（年份，如 2026）');
    }
    if (points.table && await endedSeason(fastify.db, normalizeSeason(points_season))) {
      throw fastify.httpErrors.badRequest(`${normalizeSeason(points_season)} 赛季已结束，不能再加入积分赛`);
    }
    if (!id || !name) throw fastify.httpErrors.badRequest('id and name are required');
    const existing = await repo.getById(id);
    if (existing) throw fastify.httpErrors.conflict('Tournament ID already exists');
    if (player_capacity != null && (!Number.isInteger(Number(player_capacity)) || Number(player_capacity) < 2 || Number(player_capacity) > 128)) {
      throw fastify.httpErrors.badRequest('player_capacity must be between 2 and 128');
    }
    if (game_mode != null && !GAME_MODES.includes(String(game_mode))) {
      throw fastify.httpErrors.badRequest(`game_mode must be one of: ${GAME_MODES.join(', ')}`);
    }
    if (format != null && !SUPPORTED_FORMATS.includes(String(format))) {
      throw fastify.httpErrors.badRequest(`format must be one of: ${SUPPORTED_FORMATS.join(', ')}`);
    }
    // The event type is set whether or not Ban / Pick is on; Ban / Pick
    // always draws from the pool of the event type.
    if (vehicle_pool != null && !VEHICLE_POOLS.includes(String(vehicle_pool))) {
      throw fastify.httpErrors.badRequest(`vehicle_pool must be one of: ${VEHICLE_POOLS.join(', ')}`);
    }
    if (format === 'swiss' && !isAutoRounds(swiss_rounds) && !parseSwissRounds(swiss_rounds)) {
      throw fastify.httpErrors.badRequest(`瑞士轮轮数必须是 ${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS} 之间的整数（留空为自动）`);
    }
    if (playoff_format) {
      if (!PLAYOFF_FORMATS.includes(playoff_format)) {
        throw fastify.httpErrors.badRequest(`playoff_format must be one of: ${PLAYOFF_FORMATS.join(', ')}`);
      }
      const size = swiss_group_size === null || swiss_group_size === undefined || swiss_group_size === ''
        ? null : Number(swiss_group_size);
      if (size !== null && (!Number.isInteger(size) || size < MIN_GROUP_SIZE || size > MAX_GROUP_SIZE)) {
        throw fastify.httpErrors.badRequest(`每组人数必须在 ${MIN_GROUP_SIZE}-${MAX_GROUP_SIZE} 之间（留空表示不分组）`);
      }
      const k = Number(advance_per_group);
      if (!Number.isInteger(k) || k < 1 || k > MAX_GROUP_SIZE) {
        throw fastify.httpErrors.badRequest('请设置每组晋级人数（至少 1 人）');
      }
      if (size !== null && k > size) {
        throw fastify.httpErrors.badRequest(`每组晋级人数（${k}）不能多于每组人数（${size}）`);
      }
      if (format !== 'swiss' && size !== null) {
        const problem = groupBracketProblem(format, size, k);
        if (problem) throw fastify.httpErrors.badRequest(problem);
      }
    }
    return await repo.create({
      id,
      name,
      description,
      player_capacity,
      hold_third_place,
      loser_advances,
      scheduled_time,
      game_mode,
      vehicle_pool,
      format,
      grand_final_reset,
      swiss_rounds,
      banpick_enabled,
      playoff_format,
      swiss_group_size,
      advance_per_group,
      points_table: points.table,
      points_season: normalizeSeason(points_season),
      points_kind: normalizePointsKind(points_kind),
      // Monthly events invite their champion unless told otherwise.
      points_invite: points_invite === undefined ? normalizePointsKind(points_kind) === 'monthly' : Boolean(points_invite),
    });
  });

  fastify.get('/calendar.ics', async (req, reply) => {
    const tournaments = (await fastify.db.query(`
      SELECT id, name, scheduled_time
      FROM axsuck.tournaments
      WHERE status <> 'completed' AND scheduled_time <> ''
      ORDER BY created_at ASC
    `)).rows;
    const ics = buildCalendarFeed(tournaments);
    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="suck-calendar.ics"');
    return ics;
  });

  fastify.get('/tournaments/:id/calendar.ics', async (req, reply) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const ics = buildTournamentIcs({
      id: t.id,
      name: t.name,
      scheduledTime: t.scheduled_time,
    });
    if (!ics) throw fastify.httpErrors.badRequest('Tournament has no scheduled time');
    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${t.id}.ics"`);
    return ics;
  });

  fastify.delete('/tournaments/:id', async (req) => {
    requireAdmin(fastify, req);
    const { id } = req.params;
    const t = await repo.getById(id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    await fastify.db.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [id]);
    await fastify.db.query('DELETE FROM axsuck.tournament_players WHERE tournament_id = $1', [id]);
    await fastify.db.query('DELETE FROM axsuck.tournaments WHERE id = $1', [id]);
    return { success: true };
  });
}
