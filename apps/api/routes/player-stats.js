// Statistics page data: player records (lib/player-statistics.js) and the
// retired play-time stats.

import { PlayerRepo } from '../repositories/player-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { statsScope } from '../lib/event-tier.js';
import { buildPlayerStatistics } from '../lib/player-statistics.js';

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

  // ?tier=S..D|none and ?kind=season|monthly|weekly|qualifier|misc|none
  // limit everything to the events of that tier / kind
  // (lib/player-statistics.js).
  fastify.get('/players/statistics', async (req) => {
    const scope = statsScope(req.query);
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
}
