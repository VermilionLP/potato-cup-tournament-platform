// Potato Cup points leaderboard (积分榜): per season (year) and event type,
// the points every player earned in finished events with a points table.

import { getPlayerDisplayName } from '../repositories/player-repo.js';
import { VEHICLE_POOLS } from '../lib/tournament-config.js';
import { eventPlacements } from '../lib/placements.js';
import { buildBoard, normalizeSeason, pointsFor } from '../lib/points.js';

export default async function pointsRoutes(fastify) {
  const db = fastify.db;

  fastify.get('/points-leaderboard', async (req) => {
    const events = (await db.query(`
      SELECT id, name, status, format, playoff_format, swiss_rounds, swiss_group_size, advance_per_group, vehicle_pool, points_table, points_season,
             COALESCE(played_at, created_at) AS played_at, scheduled_time
      FROM axsuck.tournaments
      WHERE points_table IS NOT NULL AND points_season IS NOT NULL
    `)).rows;
    const seasons = [...new Set(events.map((e) => e.points_season))].sort().reverse();
    const season = normalizeSeason(req.query.season) || seasons[0] || '';
    const finished = events.filter((e) => e.points_season === season && e.status === 'completed');
    if (!finished.length) return { seasons, season, boards: [] };

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
        for (const [playerId, place] of eventPlacements(e, matchesOf.get(e.id) || [], players)) {
          awarded[playerId] = pointsFor(e.points_table, place);
        }
        return { ...e, awarded };
      })
      .sort((a, b) => new Date(a.played_at) - new Date(b.played_at) || a.id.localeCompare(b.id));

    const boards = VEHICLE_POOLS
      .map((pool) => {
        const evs = scored.filter((e) => e.vehicle_pool === pool);
        if (!evs.length) return null;
        return {
          pool,
          events: evs.map((e) => ({ id: e.id, name: e.name, played_at: e.played_at })),
          players: buildBoard(evs).map((p) => {
            const meta = playerMeta.get(p.player_id) || { id: p.player_id };
            return {
              ...p,
              id: p.player_id,
              display_name: getPlayerDisplayName(meta) || p.player_id,
              flag: meta.flag || '',
              team: meta.team || '',
            };
          }),
        };
      })
      .filter(Boolean);
    return { seasons, season, boards };
  });
}
