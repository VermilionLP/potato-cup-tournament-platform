// Potato Cup points leaderboard (积分榜): per season (year) and event type,
// the points every player earned in finished events with a points table.

import { getPlayerDisplayName } from '../repositories/player-repo.js';
import { VEHICLE_POOLS } from '../lib/tournament-config.js';
import { eventPlacements } from '../lib/placements.js';
import { buildBoard, finalsQualifiers, FINALS_SPOTS, normalizeSeason, pointsFor } from '../lib/points.js';

export default async function pointsRoutes(fastify) {
  const db = fastify.db;

  fastify.get('/points-leaderboard', async (req) => {
    const events = (await db.query(`
      SELECT id, name, status, format, playoff_format, swiss_rounds, swiss_group_size, advance_per_group, vehicle_pool, points_table, points_season, points_kind, points_invite,
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
        const places = eventPlacements(e, matchesOf.get(e.id) || [], players);
        for (const [playerId, place] of places) {
          awarded[playerId] = pointsFor(e.points_table, place);
        }
        // Players by placing (for the monthly champion's finals place).
        const order = [...places].sort((a, b) => a[1].from - b[1].from).map(([id]) => id);
        return { ...e, awarded, order };
      })
      .sort((a, b) => new Date(a.played_at) - new Date(b.played_at) || a.id.localeCompare(b.id));

    const boards = VEHICLE_POOLS
      .map((pool) => {
        const evs = scored.filter((e) => e.vehicle_pool === pool);
        if (!evs.length) return null;
        const ranked = buildBoard(evs);
        // Invite events of this board, unfinished ones included (their place
        // is reserved), in date order.
        const invites = events
          .filter((e) => e.points_season === season && e.vehicle_pool === pool && e.points_invite)
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
            };
          }),
        };
      })
      .filter(Boolean);
    return { seasons, season, boards };
  });
}
