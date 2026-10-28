// Potato Cup points leaderboard (积分榜): per season (year) and event type,
// the points every player earned in finished events with a points table.

import { getPlayerDisplayName } from '../repositories/player-repo.js';
import { pointsBoardOf, VEHICLE_POOLS } from '../lib/tournament-config.js';
import { eventPlacements } from '../lib/placements.js';
import { buildBoard, finalsQualifiers, FINALS_SPOTS, normalizeSeason, pointsFor } from '../lib/points.js';
import { requireAdmin } from '../lib/admin.js';

const EVENTS_SQL = `
  SELECT id, name, status, format, playoff_format, swiss_rounds, swiss_group_size, advance_per_group, vehicle_pool, points_table, points_season, points_kind, points_invite,
         COALESCE(played_at, created_at) AS played_at, scheduled_time
  FROM axsuck.tournaments
  WHERE points_table IS NOT NULL AND points_season IS NOT NULL
`;

/** Live leaderboard boards of a season (one per event type). */
export async function computeBoards(db, season, events) {
  const finished = events.filter((e) => e.points_season === season && e.status === 'completed');
  if (!finished.length) return [];

  const ids = finished.map((e) => e.id);
  const [matches, registrations, playerRows] = await Promise.all([
    db.query("SELECT * FROM axsuck.matches WHERE tournament_id = ANY($1::text[]) AND status IN ('completed', 'walkover')", [ids]),
    db.query('SELECT tournament_id, player_id, seed, swiss_group FROM axsuck.tournament_players WHERE tournament_id = ANY($1::text[])', [ids]),
    db.query('SELECT id, flag, team FROM axsuck.players'),
  ]);
  const byEvent = (rows, key) => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r[key])) map.set(r[key], []);
      map.get(r[key]).push(r);
    }
    return map;
  };
  const matchesOf = byEvent(matches.rows, 'tournament_id');
  const playersOf = byEvent(registrations.rows, 'tournament_id');
  const playerMeta = new Map(playerRows.rows.map((p) => [p.id, p]));

  const scored = finished
    .map((e) => {
      const awarded = {};
      const players = (playersOf.get(e.id) || []).map((r) => ({ id: r.player_id, seed: r.seed, swiss_group: r.swiss_group }));
      const places = eventPlacements(e, matchesOf.get(e.id) || [], players);
      for (const [playerId, place] of places) {
        awarded[playerId] = pointsFor(e.points_table, place);
      }
      // Players by placing (for the monthly champion's finals place).
      const order = [...places].sort((a, b) => a[1].from - b[1].from).map(([id]) => id);
      return { ...e, awarded, order, places };
    })
    .sort((a, b) => new Date(a.played_at) - new Date(b.played_at) || a.id.localeCompare(b.id));

  // One board per event type; Top Jet events count towards Legacy Jet.
  const boards = VEHICLE_POOLS
    .filter((pool) => pointsBoardOf(pool) === pool)
    .map((pool) => {
      const evs = scored.filter((e) => pointsBoardOf(e.vehicle_pool) === pool);
      if (!evs.length) return null;
      const ranked = buildBoard(evs);
      // Invite events of this board, unfinished ones included (their place
      // is reserved), in date order.
      const invites = events
        .filter((e) => e.points_season === season && pointsBoardOf(e.vehicle_pool) === pool && e.points_invite)
        .sort((a, b) => new Date(a.played_at) - new Date(b.played_at) || a.id.localeCompare(b.id))
        .map((e) => ({ id: e.id, name: e.name, finished: e.status === 'completed', order: evs.find((x) => x.id === e.id)?.order || null }));
      const qualified = finalsQualifiers(ranked, invites);
      return {
        pool,
        events: evs.map((e) => ({ id: e.id, name: e.name, played_at: e.played_at, kind: e.points_kind || 'weekly', invite: Boolean(e.points_invite) })),
        finals: {
          spots: FINALS_SPOTS,
          invites: invites.map(({ id, name, finished }) => ({ id, name, finished })),
          points_spots: Math.max(0, FINALS_SPOTS - invites.length),
        },
        players: ranked.map((p) => {
          const meta = playerMeta.get(p.player_id) || { id: p.player_id };
          return {
            ...p,
            id: p.player_id,
            display_name: getPlayerDisplayName(meta) || p.player_id,
            flag: meta.flag || '',
            team: meta.team || '',
            finals: qualified.get(p.player_id) || null,
            // Placing in each event the player scored in (cell colours).
            places: Object.fromEntries(
              evs.filter((e) => p.points[e.id]).map((e) => [e.id, e.places.get(p.player_id)]),
            ),
          };
        }),
      };
    })
    .filter(Boolean);
  return boards;
}

export default async function pointsRoutes(fastify) {
  const db = fastify.db;

  async function seasonRows() {
    return (await db.query('SELECT season, is_current, ended_at, snapshot IS NOT NULL AS frozen FROM axsuck.points_seasons')).rows;
  }

  // Seasons: those with events plus those set up by admins; the current one.
  async function seasonState(events) {
    const rows = await seasonRows();
    const seasons = [...new Set([...events.map((e) => e.points_season), ...rows.map((r) => r.season)])].sort().reverse();
    const current = rows.find((r) => r.is_current)?.season || '';
    const ended = Object.fromEntries(rows.filter((r) => r.ended_at).map((r) => [r.season, r.ended_at]));
    return { seasons, current, ended };
  }

  fastify.get('/points-leaderboard', async (req) => {
    const events = (await db.query(EVENTS_SQL)).rows;
    const { seasons, current, ended } = await seasonState(events);
    const season = normalizeSeason(req.query.season) || current || seasons[0] || '';
    const base = { seasons, season, current, ended_at: ended[season] || null };
    // An ended season shows the leaderboard frozen when it ended.
    if (ended[season]) {
      const row = (await db.query('SELECT snapshot FROM axsuck.points_seasons WHERE season = $1', [season])).rows[0];
      return { ...base, boards: row?.snapshot?.boards || [] };
    }
    return { ...base, boards: await computeBoards(db, season, events) };
  });

  fastify.get('/points-seasons', async () => {
    const events = (await db.query(EVENTS_SQL)).rows;
    const { seasons, current, ended } = await seasonState(events);
    return { current, seasons: seasons.map((season) => ({ season, ended_at: ended[season] || null })) };
  });

  // The current season: the default season of new events.
  fastify.put('/points-seasons/current', async (req) => {
    requireAdmin(fastify, req);
    const season = normalizeSeason(req.body?.season);
    if (!season) throw fastify.httpErrors.badRequest('赛季必须是年份，如 2027');
    const row = (await db.query('SELECT ended_at FROM axsuck.points_seasons WHERE season = $1', [season])).rows[0];
    if (row?.ended_at) throw fastify.httpErrors.badRequest(`${season} 赛季已结束，不能设为当前赛季`);
    await db.query('UPDATE axsuck.points_seasons SET is_current = FALSE, updated_at = NOW() WHERE is_current');
    await db.query(`
      INSERT INTO axsuck.points_seasons (season, is_current) VALUES ($1, TRUE)
      ON CONFLICT (season) DO UPDATE SET is_current = TRUE, updated_at = NOW()
    `, [season]);
    return { current: season };
  });

  // End a season: freeze its leaderboard and Winter Finals list; its events'
  // points can no longer be changed.
  fastify.post('/points-seasons/:season/end', async (req) => {
    requireAdmin(fastify, req);
    const season = normalizeSeason(req.params.season);
    if (!season) throw fastify.httpErrors.badRequest('赛季必须是年份，如 2026');
    const events = (await db.query(EVENTS_SQL)).rows;
    const unfinished = events.filter((e) => e.points_season === season && e.status !== 'completed');
    if (unfinished.length && !req.body?.force) {
      throw fastify.httpErrors.badRequest(`${season} 赛季还有 ${unfinished.length} 场积分赛没有结束：${unfinished.map((e) => e.name).join('、')}`);
    }
    const boards = await computeBoards(db, season, events);
    await db.query(`
      INSERT INTO axsuck.points_seasons (season, ended_at, snapshot, is_current) VALUES ($1, NOW(), $2::jsonb, FALSE)
      ON CONFLICT (season) DO UPDATE SET ended_at = NOW(), snapshot = EXCLUDED.snapshot, is_current = FALSE, updated_at = NOW()
    `, [season, JSON.stringify({ boards })]);
    return { season, ended: true, boards: boards.length };
  });

  // Undo an end (e.g. by mistake): the leaderboard is live and editable again.
  fastify.post('/points-seasons/:season/reopen', async (req) => {
    requireAdmin(fastify, req);
    const season = normalizeSeason(req.params.season);
    if (!season) throw fastify.httpErrors.badRequest('赛季必须是年份，如 2026');
    await db.query('UPDATE axsuck.points_seasons SET ended_at = NULL, snapshot = NULL, updated_at = NOW() WHERE season = $1', [season]);
    return { season, ended: false };
  });
}
