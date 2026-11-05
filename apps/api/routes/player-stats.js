// Statistics page data: player records (lib/player-statistics.js) and the
// retired play-time stats.

import { PlayerRepo } from '../repositories/player-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { statsScope } from '../lib/event-tier.js';
import { buildPlayerStatistics } from '../lib/player-statistics.js';
import { cached } from '../lib/ladder-cache.js';
import { buildBanpickStats } from '../lib/banpick-stats.js';

export default async function playerStatsRoutes(fastify) {
  const repo = PlayerRepo(fastify.db);
  const ladderRepo = LadderRepo(fastify.db);

  // Play-time statistics used to be derived from parsed replay start times.
  // Replay support has been removed, so the endpoint reports an empty dataset
  // while keeping its response shape for the statistics page.
  fastify.get('/stats/play-times', async () => ({
    total_games: 0,
    total_nights: 0,
    weekdays: [0, 0, 0, 0, 0, 0, 0],
    night_hours: {},
    top_slots: []
  }));

  // ?tier=S..D|none and ?kind=major|weekly|qualifier|none
  // limit everything to the events of that tier / kind
  // (lib/player-statistics.js).
  fastify.get('/players/statistics', async (req) => {
    const scope = statsScope(req.query);
    // Cached like the ladder (lib/ladder-cache.js): dropped on every write.
    return cached(fastify.db, JSON.stringify(['statistics', scope.tier, scope.kind]), async () => {
      const players = await repo.list();
      const allTournaments = (await fastify.db.query(
        'SELECT id, name, game_mode, vehicle_pool, status, format, playoff_format, swiss_rounds, swiss_group_size, advance_per_group, source_title, tier, event_kind FROM axsuck.tournaments'
      )).rows;
      const tournaments = allTournaments.filter(scope);
      const inScope = new Set(tournaments.map((t) => t.id));
      const registrations = (await fastify.db.query('SELECT * FROM axsuck.tournament_players')).rows
        .filter((r) => inScope.has(r.tournament_id));
      const matches = (await fastify.db.query("SELECT * FROM axsuck.matches WHERE status IN ('completed', 'walkover')")).rows
        .filter((m) => inScope.has(m.tournament_id));
      const playedMatches = (await fastify.db.query("SELECT tournament_id FROM axsuck.matches WHERE status != 'pending'")).rows;
      const ladder = await ladderRepo.getRatings({ includeInactive: true });
      return buildPlayerStatistics({ players, tournaments, registrations, matches, playedMatches, ladder, scope });
    });
  });

  // Ban / Pick numbers (lib/banpick-stats.js) for one event type (?type=,
  // default the busiest), in the same tier / kind scope; ?player= adds that
  // player's bans and played vehicles.
  fastify.get('/banpick/stats', async (req) => {
    const scope = statsScope(req.query);
    const type = String(req.query?.type || '').slice(0, 40);
    const player = String(req.query?.player || '').slice(0, 80);
    return cached(fastify.db, JSON.stringify(['banpick-stats', scope.tier, scope.kind, type, player]), async () => {
      const rows = (await fastify.db.query(`
        SELECT m.banpick, m.player1_id, m.player2_id, m.winner_id, m.status,
               t.vehicle_pool, t.id AS tournament_id, t.tier, t.event_kind
        FROM axsuck.matches m JOIN axsuck.tournaments t ON t.id = m.tournament_id
        WHERE m.banpick IS NOT NULL
      `)).rows.filter((r) => scope({ tier: r.tier, event_kind: r.event_kind }));
      return buildBanpickStats(rows, { type, player });
    });
  });
}
