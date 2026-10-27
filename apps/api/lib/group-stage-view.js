// The group stage of a two-stage event as shown on the event page: group
// standings (Swiss groups or elimination brackets per group), qualifiers in
// playoff seed order and tie warnings. Pure: shared by the event route and
// the placings used for statistics and points.

import {
  GROUP_BRACKETS,
  groupBracketComplete,
  groupBracketPlacings,
  selectBracketQualifiers,
} from './group-brackets.js';
import {
  groupLabel,
  groupStageComplete,
  groupStandings,
  seedPlayoffs,
  selectQualifiers,
} from './group-stage.js';
import { effectiveSwissRounds, SWISS_BRACKET } from './swiss.js';

// Group standings, qualifiers (in playoff seed order) and tie warnings of a
// two-stage event.
function buildGroupStage(t, players, swissMatches) {
  const field = players.map((p) => ({ id: p.id, seed: p.seed, swiss_group: p.swiss_group }));
  const groups = groupStandings(field, swissMatches);
  const perGroup = Number(t.advance_per_group) || 1;
  const { qualifiers, warnings } = selectQualifiers(groups, perGroup);
  const { seeded, sameGroupPairs } = seedPlayoffs(qualifiers);
  const roundsFor = (size) => effectiveSwissRounds(t.swiss_rounds, size);
  const complete = swissMatches.length > 0 && groupStageComplete(field, swissMatches, roundsFor);
  return {
    groups: groups.map((g) => ({ ...g, rounds: roundsFor(g.rows.length) })),
    per_group: perGroup,
    complete,
    qualifiers: seeded.map((q, i) => ({
      player_id: q.player_id,
      group: q.group,
      group_label: q.group_label,
      group_rank: q.group_rank,
      playoff_seed: i + 1,
    })),
    warnings,
    same_group_pairs: sameGroupPairs,
  };
}

// Group stage played as single-/double-elimination brackets per group.
function buildBracketGroupStage(t, players, groupMatches) {
  const perGroup = Number(t.advance_per_group) || 1;
  const groupIds = [...new Set(players.map((p) => p.swiss_group || 1))].sort((a, b) => a - b);
  const groups = groupIds.map((group) => {
    const own = players.filter((p) => (p.swiss_group || 1) === group);
    const ownMatches = groupMatches.filter((m) => (m.swiss_group || 1) === group);
    return {
      group,
      label: groupLabel(group),
      rows: groupBracketPlacings(t.format, own.map((p) => ({ id: p.id, seed: p.seed })), ownMatches, perGroup),
      complete: groupBracketComplete(ownMatches),
    };
  });
  const { qualifiers, warnings } = selectBracketQualifiers(groups, perGroup);
  const { seeded, sameGroupPairs } = seedPlayoffs(qualifiers);
  return {
    kind: 'bracket',
    format: t.format,
    groups,
    per_group: perGroup,
    complete: groups.length > 0 && groups.every((g) => g.complete),
    qualifiers: seeded.map((q, i) => ({
      player_id: q.player_id,
      group: q.group,
      group_label: q.group_label,
      group_rank: q.group_rank,
      how: q.how,
      playoff_seed: i + 1,
    })),
    warnings,
    same_group_pairs: sameGroupPairs,
  };
}

// Group stage of a two-stage event, whatever format it is played in. Once
// groups are drawn, players without a group (invited straight into the
// playoff, as in some imported events) are not part of it.
export function groupStageOf(t, allPlayers, allMatches) {
  const players = allPlayers.some((p) => p.swiss_group) ? allPlayers.filter((p) => p.swiss_group) : allPlayers;
  if (t.format === 'swiss') {
    return { kind: 'swiss', ...buildGroupStage(t, players, allMatches.filter((m) => m.bracket === SWISS_BRACKET)) };
  }
  return buildBracketGroupStage(t, players, allMatches.filter((m) => GROUP_BRACKETS.includes(m.bracket)));
}

