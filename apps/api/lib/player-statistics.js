// GET /players/statistics: every player's record (matches, maps, modes,
// event types, titles by tier, rivals, placings) over the events in scope.
// Pure: the route loads the rows. Rankings are the top five per board.

import { GAME_MODES, VEHICLE_POOLS } from './tournament-config.js';
import { isQualifierEvent, tournamentChampion } from './champions.js';
import { betterPlace, eventPlacements } from './placements.js';
import { ACTIVE_DAYS } from './ladder.js';

/**
 * @param {object} data
 * @param {object[]} data.players       all players (PlayerRepo.list)
 * @param {object[]} data.tournaments   the events in scope
 * @param {object[]} data.registrations their entrants
 * @param {object[]} data.matches       their completed / walkover matches
 * @param {object[]} data.playedMatches { tournament_id } of every non-pending match
 * @param {{ byId: Map }} data.ladder   LadderRepo.getRatings({ includeInactive: true })
 * @param {(t) => boolean} data.scope   lib/event-tier.js statsScope
 * @param {number} [data.now]
 */
export function buildPlayerStatistics({ players, tournaments, registrations, matches, playedMatches, ladder, scope, now = Date.now() }) {
  const inScope = new Set(tournaments.map((t) => t.id));
  const tournamentMap = {};
  const modeOf = {};
  const poolOf = {};
  for (const t of tournaments) {
    tournamentMap[t.id] = t.name;
    modeOf[t.id] = GAME_MODES.includes(t.game_mode) ? t.game_mode : 'rb';
    poolOf[t.id] = VEHICLE_POOLS.includes(t.vehicle_pool) ? t.vehicle_pool : null;
  }
  const emptyRecords = (keys) => Object.fromEntries(keys.map((m) => [m, {
    tournaments: 0, matches_won: 0, matches_lost: 0, maps_won: 0, maps_lost: 0,
  }]));
  const emptyModes = () => emptyRecords(GAME_MODES);

  const stats = {};
  for (const p of players) {
    stats[p.id] = {
      id: p.id,
      display_name: p.display_name,
      team: p.team || '',
      flag: p.flag || 'cn',
      tournaments_played: 0,
      matches_played: 0,
      matches_won: 0,
      matches_lost: 0,
      walkover_wins: 0,
      walkover_losses: 0,
      maps_played: 0,
      maps_won: 0,
      maps_lost: 0,
      modes: emptyModes(),
      pools: emptyRecords(VEHICLE_POOLS),
      championships: 0,
      championships_by_tier: {},
      runner_ups: 0,
      runner_ups_by_tier: {},
      opponents: {},
      tournament_ids: []
    };
  }

  for (const reg of registrations) {
    if (stats[reg.player_id]) {
      stats[reg.player_id].tournaments_played++;
      const mode = modeOf[reg.tournament_id];
      if (mode) stats[reg.player_id].modes[mode].tournaments++;
      const pool = poolOf[reg.tournament_id];
      if (pool) stats[reg.player_id].pools[pool].tournaments++;
      if (!stats[reg.player_id].tournament_ids.includes(reg.tournament_id)) {
        stats[reg.player_id].tournament_ids.push(reg.tournament_id);
      }
    }
  }

  for (const m of matches) {
    const p1 = m.player1_id;
    const p2 = m.player2_id;
    const w = m.winner_id;
    if (!p1 || !p2) continue;

    if (m.status === 'walkover') {
      if (w === p1) {
        if (stats[p1]) stats[p1].walkover_wins++;
        if (stats[p2]) stats[p2].walkover_losses++;
      } else if (w === p2) {
        if (stats[p2]) stats[p2].walkover_wins++;
        if (stats[p1]) stats[p1].walkover_losses++;
      }
    } else {
      const p1Won = m.score1 > m.score2;
      const s1 = m.score1;
      const s2 = m.score2;
      const totalMaps = s1 + s2;
      const mode = modeOf[m.tournament_id] || 'rb';
      const pool = poolOf[m.tournament_id];
      for (const [id, won, mine, theirs] of [[p1, p1Won, s1, s2], [p2, !p1Won, s2, s1]]) {
        const recs = [stats[id]?.modes[mode], pool ? stats[id]?.pools[pool] : null];
        for (const rec of recs) {
          if (!rec) continue;
          if (won) rec.matches_won++;
          else rec.matches_lost++;
          rec.maps_won += mine;
          rec.maps_lost += theirs;
        }
      }

      if (stats[p1]) {
        stats[p1].matches_played++;
        if (p1Won) stats[p1].matches_won++;
        else stats[p1].matches_lost++;

        stats[p1].maps_played += totalMaps;
        stats[p1].maps_won += s1;
        stats[p1].maps_lost += s2;

        if (stats[p2]) {
          if (!stats[p1].opponents[p2]) {
            stats[p1].opponents[p2] = { won_matches: 0, lost_matches: 0, won_maps: 0, lost_maps: 0 };
          }
          if (p1Won) stats[p1].opponents[p2].won_matches++;
          else stats[p1].opponents[p2].lost_matches++;

          stats[p1].opponents[p2].won_maps += s1;
          stats[p1].opponents[p2].lost_maps += s2;
        }
      }

      if (stats[p2]) {
        stats[p2].matches_played++;
        if (!p1Won) stats[p2].matches_won++;
        else stats[p2].matches_lost++;

        stats[p2].maps_played += totalMaps;
        stats[p2].maps_won += s2;
        stats[p2].maps_lost += s1;

        if (stats[p1]) {
          if (!stats[p2].opponents[p1]) {
            stats[p2].opponents[p1] = { won_matches: 0, lost_matches: 0, won_maps: 0, lost_maps: 0 };
          }
          if (!p1Won) stats[p2].opponents[p1].won_matches++;
          else stats[p2].opponents[p1].lost_matches++;

          stats[p2].opponents[p1].won_maps += s2;
          stats[p2].opponents[p1].lost_maps += s1;
        }
      }
    }
  }

  // Titles: the champion of every finished event (qualifiers excluded).
  const matchesByEvent = new Map();
  for (const m of matches) {
    if (!matchesByEvent.has(m.tournament_id)) matchesByEvent.set(m.tournament_id, []);
    matchesByEvent.get(m.tournament_id).push(m);
  }
  const playersByEvent = new Map();
  for (const reg of registrations) {
    if (!playersByEvent.has(reg.tournament_id)) playersByEvent.set(reg.tournament_id, []);
    playersByEvent.get(reg.tournament_id).push({ id: reg.player_id, seed: reg.seed, swiss_group: reg.swiss_group });
  }
  // Placings of every finished event; the best one (qualifiers excluded)
  // stands in for titles on the overview.
  const placeOf = new Map(); // `${tournament}|${player}` -> { from, to }
  const bestPlace = {};
  for (const t of tournaments) {
    if (t.status !== 'completed') continue;
    const evMatches = matchesByEvent.get(t.id) || [];
    const evPlayers = playersByEvent.get(t.id) || [];
    const qualifier = isQualifierEvent(t);
    if (!qualifier) {
      const champion = tournamentChampion(t, evMatches, evPlayers);
      if (champion && stats[champion]) {
        stats[champion].championships += 1;
        const tier = t.tier || 'none';
        stats[champion].championships_by_tier[tier] = (stats[champion].championships_by_tier[tier] || 0) + 1;
      }
    }
    for (const [playerId, place] of eventPlacements(t, evMatches, evPlayers)) {
      placeOf.set(`${t.id}|${playerId}`, place);
      if (qualifier) continue;
      bestPlace[playerId] = betterPlace(bestPlace[playerId], place);
      // Runner-up: second on its own (qualifiers excluded, like titles).
      if (place.from === 2 && place.to === 2 && stats[playerId]) {
        const tier = t.tier || 'none';
        stats[playerId].runner_ups += 1;
        stats[playerId].runner_ups_by_tier[tier] = (stats[playerId].runner_ups_by_tier[tier] || 0) + 1;
      }
    }
  }
  const qualifierIds = new Set(tournaments.filter(isQualifierEvent).map((t) => t.id));

  // Activity and rating, as on the ladder: last rated game and whether the
  // player has any rated game at all.
  const activeSince = now - ACTIVE_DAYS * 86400000;

  const playerStats = Object.values(stats).map(s => {
    let nemesis = null;
    let maxLostMatches = 0;
    let favorite = null;
    let maxWonMatches = 0;

    for (const [oppId, rec] of Object.entries(s.opponents)) {
      if (rec.lost_matches > maxLostMatches) {
        maxLostMatches = rec.lost_matches;
        nemesis = oppId;
      }
      if (rec.won_matches > maxWonMatches) {
        maxWonMatches = rec.won_matches;
        favorite = oppId;
      }
    }

    const nemesisDisp = nemesis && stats[nemesis] ? stats[nemesis].display_name : nemesis;
    const favoriteDisp = favorite && stats[favorite] ? stats[favorite].display_name : favorite;

    // Favourite mode: most matches played, then most events entered;
    // '' when the player has neither.
    let mainMode = '';
    let best = 0;
    for (const mode of GAME_MODES) {
      const r = s.modes[mode];
      const score = (r.matches_won + r.matches_lost) * 1000 + r.tournaments;
      if (score > best) {
        best = score;
        mainMode = mode;
      }
    }

    return {
      id: s.id,
      display_name: s.display_name,
      team: s.team,
      flag: s.flag,
      main_mode: mainMode,
      tournaments_played: s.tournaments_played,
      matches_played: s.matches_played,
      matches_won: s.matches_won,
      matches_lost: s.matches_lost,
      match_win_rate: s.matches_played > 0 ? (s.matches_won / s.matches_played) : 0,
      walkover_wins: s.walkover_wins,
      walkover_losses: s.walkover_losses,
      maps_played: s.maps_played,
      maps_won: s.maps_won,
      maps_lost: s.maps_lost,
      map_win_rate: s.maps_played > 0 ? (s.maps_won / s.maps_played) : 0,
      modes: s.modes,
      pools: s.pools,
      championships: s.championships,
      championships_by_tier: s.championships_by_tier,
      runner_ups: s.runner_ups,
      runner_ups_by_tier: s.runner_ups_by_tier,
      nemesis: nemesis ? { id: nemesis, display_name: nemesisDisp, count: maxLostMatches } : null,
      favorite: favorite ? { id: favorite, display_name: favoriteDisp, count: maxWonMatches } : null,
      best_place: bestPlace[s.id] || null,
      // Sort key for the titles column: titles first, then the best placing.
      honor_score: s.championships > 0
        ? 100000 + s.championships
        : bestPlace[s.id] ? 1000 - Math.min(999, bestPlace[s.id].from) : 0,
      last_game_at: ladder.byId.get(s.id)?.last_game_at ?? null,
      rated: (ladder.byId.get(s.id)?.games ?? 0) > 0,
      active: (() => {
        const at = ladder.byId.get(s.id)?.last_game_at;
        return at != null && new Date(at).getTime() >= activeSince;
      })(),
      tournaments: s.tournament_ids.map(tid => ({
        id: tid,
        name: tournamentMap[tid] || tid,
        place: placeOf.get(`${tid}|${s.id}`) || null,
        qualifier: qualifierIds.has(tid),
      }))
    };
  });

  const totalTournaments = tournaments.length;
  const totalMatches = playedMatches.filter((m) => inScope.has(m.tournament_id)).length;
  // Filtered to a tier / kind: only the players who took part.
  const scoped = scope.tier || scope.kind;
  const shown = scoped ? playerStats.filter((p) => p.tournaments_played > 0) : playerStats;

  const eligibleForRate = shown.filter(p => p.matches_played >= 5);

  return {
    players: shown,
    scope: { tier: scope.tier, kind: scope.kind },
    global: {
      total_players: shown.length,
      total_tournaments: totalTournaments,
      total_matches: totalMatches
    },
    rankings: {
      by_championships: [...shown]
        .filter(p => p.championships > 0)
        .sort((a, b) => b.championships - a.championships || b.match_win_rate - a.match_win_rate)
        .slice(0, 5),
      by_runner_ups: [...shown]
        .filter(p => p.runner_ups > 0)
        .sort((a, b) => b.runner_ups - a.runner_ups || b.championships - a.championships || b.match_win_rate - a.match_win_rate)
        .slice(0, 5),
      by_win_rate: [...eligibleForRate]
        .sort((a, b) => b.match_win_rate - a.match_win_rate)
        .slice(0, 5),
      by_played: [...shown]
        .sort((a, b) => b.matches_played - a.matches_played)
        .slice(0, 5),
      by_walkover: [...shown]
        .filter(p => p.walkover_losses > 0)
        .sort((a, b) => b.walkover_losses - a.walkover_losses)
        .slice(0, 5)
    }
  };
}
