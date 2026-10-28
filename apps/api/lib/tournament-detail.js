// GET /tournaments/:id: the event with its players (and their ladder
// ratings), matches, Swiss standings or group stage, round counts, points
// awarded and votes. Pure, so it can be tested without a database.

import { pointsFor } from './points.js';
import { liveChannelsView } from './live-channels.js';
import { eventPlacements } from './placements.js';
import { groupStageOf } from './group-stage-view.js';
import { computeStandings, effectiveSwissRounds, isAutoRounds, SWISS_BRACKET } from './swiss.js';

/**
 * Players with the MMR of the event's division (game mode + event type),
 * the same ratings automatic seeding uses; players with no games there are
 * unrated. `ladder`: { ratingOf(id), cutoff } from LadderRepo.eventRatings.
 */
export function playersWithLadder(players, ladder) {
  return players.map((p) => {
    const l = ladder.ratingOf(p.id);
    return {
      ...p,
      ladder_mmr: l?.mmr ?? null,
      ladder_games: l?.games ?? 0,
      ladder_provisional: l ? l.provisional : true,
      ladder_active: l ? new Date(l.last_game_at).getTime() >= ladder.cutoff : null,
      ladder_tier: l?.tier ?? { key: 'unrated', group: 'unrated', name: '未定级' },
    };
  });
}

export function tournamentDetail(t, { players, matches: ms, votes, customVotes, ladder, channels = [] }) {
  // Live channels; the old top-level fields mirror channel 1.
  const liveChannels = liveChannelsView(channels);
  const main = liveChannels[0];
  const swissMatches = ms.filter((m) => m.bracket === SWISS_BRACKET);
  const standings = t.format === 'swiss' && !t.playoff_format
    ? computeStandings(players.map((p) => ({ id: p.id, seed: p.seed })), swissMatches)
    : undefined;
  const groupStage = t.playoff_format ? groupStageOf(t, players, ms) : undefined;

  // Rounds actually played; an automatic count follows the field size.
  const swissRoundsEffective = t.format !== 'swiss'
    ? undefined
    : groupStage
      ? Math.max(1, ...groupStage.groups.map((g) => g.rounds))
      : effectiveSwissRounds(t.swiss_rounds, players.length);

  // Points each player earned (finished events with a points table).
  let pointsAwarded;
  if (t.points_table?.length && t.status === 'completed') {
    pointsAwarded = {};
    const places = eventPlacements(t, ms, players.map((p) => ({ id: p.id, seed: p.seed, swiss_group: p.swiss_group })));
    for (const [playerId, place] of places) pointsAwarded[playerId] = pointsFor(t.points_table, place);
  }

  return {
    ...t,
    active_match_id: main.active_match_id,
    overlay_scene: main.overlay_scene,
    overlay_round: main.overlay_round,
    overlay_stage: main.overlay_stage,
    live_channels: liveChannels,
    points_awarded: pointsAwarded,
    players: playersWithLadder(players, ladder),
    matches: ms,
    standings,
    group_stage: groupStage,
    swiss_rounds_auto: t.format === 'swiss' ? isAutoRounds(t.swiss_rounds) : undefined,
    swiss_rounds_effective: swissRoundsEffective,
    votes,
    custom_votes: customVotes,
  };
}
