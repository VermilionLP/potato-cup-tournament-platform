// Two-stage events: a Swiss group stage, then a single- or double-elimination
// playoff. Pure functions, no database access.
//
// Rules (agreed with the organisers):
// - The admin sets the players per group and how many advance from each group
//   when creating the event. The number of groups follows from the number of
//   registered players at the start: ceil(players / group size).
// - Players are spread over the groups in snake order by seed
//   (A B C D D C B A A B ...), so every group gets a fair share of top seeds.
// - Each group plays its own Swiss rounds (same count for all groups).
// - Qualifiers are the top K of each group. They are seeded into the playoff
//   by group rank first (all group winners, then all runners-up, ...), and
//   within a rank by points, game differential, opponent score (Buchholz) and
//   registration seed. Higher seeds get the byes when the field is not a power
//   of two. Players from the same group are kept apart in the first playoff
//   round when a same-rank swap allows it.
// - A tie right on the qualification line that only the registration seed
//   breaks is reported to the admin, who confirms before the playoff starts.

import { computeStandings, parseSwissRounds, swissRoundComplete } from './swiss.js';
import { seedingOrder } from './double-elim.js';

export const PLAYOFF_FORMATS = ['single_elim', 'double_elim'];
export const MIN_GROUP_SIZE = 2;
export const MAX_GROUP_SIZE = 64;

export function groupLabel(group) {
  return String.fromCharCode(64 + Number(group));
}

/** Number of groups for `playerCount` players; no group size means one group. */
export function groupCountFor(playerCount, groupSize) {
  const n = Number(playerCount) || 0;
  const size = Number(groupSize) || 0;
  if (!size || n <= 0) return 1;
  return Math.max(1, Math.ceil(n / size));
}

/** Players (sorted by seed) to groups in snake order. Returns Map id -> group (1-based). */
export function assignGroups(playersBySeed, groupCount) {
  const count = Math.max(1, groupCount);
  const result = new Map();
  playersBySeed.forEach((p, i) => {
    const row = Math.floor(i / count);
    const col = i % count;
    result.set(p.id, row % 2 === 0 ? col + 1 : count - col);
  });
  return result;
}

/** Standings per group. `players`: [{ id, seed, swiss_group }]; `matches`: Swiss matches. */
export function groupStandings(players, matches) {
  const groups = [...new Set(players.map((p) => p.swiss_group || 1))].sort((a, b) => a - b);
  return groups.map((group) => ({
    group,
    label: groupLabel(group),
    rows: computeStandings(
      players.filter((p) => (p.swiss_group || 1) === group),
      matches.filter((m) => (m.swiss_group || 1) === group),
    ),
  }));
}

/** True when every group has finished all `totalRounds` rounds. */
export function groupStageComplete(players, matches, totalRounds) {
  const groups = [...new Set(players.map((p) => p.swiss_group || 1))];
  return groups.every((group) => {
    const own = matches.filter((m) => (m.swiss_group || 1) === group);
    const last = own.reduce((max, m) => Math.max(max, m.round), 0);
    return last >= totalRounds && swissRoundComplete(own, last);
  });
}

function sameStats(a, b) {
  return a && b && a.points === b.points && a.game_diff === b.game_diff && a.buchholz === b.buchholz;
}

/**
 * Top `perGroup` of each group, ordered for playoff seeding, plus warnings for
 * qualification-line ties decided only by registration seed.
 */
export function selectQualifiers(standingsByGroup, perGroup) {
  const qualifiers = [];
  const warnings = [];
  for (const { group, label, rows } of standingsByGroup) {
    rows.slice(0, perGroup).forEach((row, i) => {
      qualifiers.push({ ...row, group, group_label: label, group_rank: i + 1 });
    });
    const lastIn = rows[perGroup - 1];
    const firstOut = rows[perGroup];
    if (sameStats(lastIn, firstOut)) {
      warnings.push({
        group,
        player_in: lastIn.player_id,
        player_out: firstOut.player_id,
        message: `${label} 组第 ${perGroup} 名与第 ${perGroup + 1} 名积分、小分、对手分完全相同，按报名种子决定晋级`,
      });
    }
  }
  qualifiers.sort(
    (a, b) =>
      a.group_rank - b.group_rank ||
      b.points - a.points ||
      b.game_diff - a.game_diff ||
      b.buchholz - a.buchholz ||
      a.seed - b.seed,
  );
  return { qualifiers, warnings };
}

/** First-round seed pairs of a bracket for `n` players (byes omitted). */
export function firstRoundSeedPairs(n) {
  const size = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(2, n))));
  const order = seedingOrder(size);
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) {
    if (order[i] <= n && order[i + 1] <= n) pairs.push([order[i], order[i + 1]]);
  }
  return pairs;
}

/**
 * Playoff seed order (array of qualifiers, index = seed - 1). Swaps players of
 * the same group rank so that first-round opponents come from different
 * groups whenever possible. Returns { seeded, sameGroupPairs }.
 */
export function seedPlayoffs(qualifiers) {
  const seeded = [...qualifiers];
  const n = seeded.length;
  const pairs = firstRoundSeedPairs(n);
  const partnerOf = new Map();
  for (const [a, b] of pairs) {
    partnerOf.set(a, b);
    partnerOf.set(b, a);
  }
  const at = (seed) => seeded[seed - 1];
  const clash = (seed) => {
    const partner = partnerOf.get(seed);
    return partner !== undefined && at(seed).group === at(partner).group;
  };

  for (let pass = 0; pass < n; pass += 1) {
    let changed = false;
    for (const [a, b] of pairs) {
      if (!clash(a)) continue;
      // Move the lower-seeded player (b) by swapping with an equal-ranked player.
      for (let s = 1; s <= n; s += 1) {
        if (s === a || s === b || at(s).group_rank !== at(b).group_rank) continue;
        [seeded[b - 1], seeded[s - 1]] = [seeded[s - 1], seeded[b - 1]];
        if (!clash(b) && !clash(s)) {
          changed = true;
          break;
        }
        [seeded[b - 1], seeded[s - 1]] = [seeded[s - 1], seeded[b - 1]];
      }
    }
    if (!changed) break;
  }

  const sameGroupPairs = pairs.filter(([a, b]) => at(a).group === at(b).group).length;
  return { seeded, sameGroupPairs };
}

/** Why a two-stage event cannot start, or null. */
export function twoStageStartBlockedReason(playerCount, { rounds, groupSize, perGroup, playoffFormat }) {
  const count = Number(playerCount) || 0;
  if (!parseSwissRounds(rounds)) return '请先设置瑞士轮轮数（1-15）';
  if (!PLAYOFF_FORMATS.includes(playoffFormat)) return '请先选择淘汰赛赛制';
  const groups = groupCountFor(count, groupSize);
  const smallest = Math.floor(count / groups);
  if (smallest < MIN_GROUP_SIZE) return `分成 ${groups} 组后每组不足 ${MIN_GROUP_SIZE} 人（当前 ${count} 人）`;
  if (rounds > smallest - 1) {
    return `最小的组只有 ${smallest} 人，最多只能打 ${smallest - 1} 轮瑞士轮（当前设置 ${rounds} 轮）`;
  }
  const k = Number(perGroup) || 0;
  if (k < 1) return '请先设置每组晋级人数';
  if (k > smallest) return `每组晋级 ${k} 人，但最小的组只有 ${smallest} 人`;
  const total = groups * k;
  const minPlayoff = playoffFormat === 'double_elim' ? 4 : 2;
  if (total < minPlayoff) {
    return `${playoffFormat === 'double_elim' ? '双败' : '单败'}淘汰赛至少需要 ${minPlayoff} 名晋级选手（当前 ${groups} 组 × ${k} = ${total} 人）`;
  }
  return null;
}
