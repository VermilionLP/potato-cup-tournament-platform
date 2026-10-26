import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assignGroups,
  firstRoundSeedPairs,
  groupCountFor,
  groupLabel,
  groupStageComplete,
  groupStandings,
  seedPlayoffs,
  selectQualifiers,
  twoStageStartBlockedReason,
} from '../lib/group-stage.js';
import { pairSwissRound } from '../lib/swiss.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));

test('group count follows the group size; no size means one group', () => {
  assert.equal(groupCountFor(32, 8), 4);
  assert.equal(groupCountFor(30, 8), 4);
  assert.equal(groupCountFor(9, 8), 2);
  assert.equal(groupCountFor(8, 8), 1);
  assert.equal(groupCountFor(20, null), 1);
  assert.equal(groupLabel(1), 'A');
  assert.equal(groupLabel(4), 'D');
});

test('players are spread over groups in snake order by seed', () => {
  const groups = assignGroups(players(8), 4);
  assert.deepEqual(
    players(8).map((p) => groups.get(p.id)),
    [1, 2, 3, 4, 4, 3, 2, 1],
  );
  const sizes = [...assignGroups(players(30), 4).values()].reduce((m, g) => ({ ...m, [g]: (m[g] || 0) + 1 }), {});
  assert.deepEqual(Object.values(sizes).sort(), [7, 7, 8, 8]);
});

const done = (round, group, p1, p2, s1, s2) => ({
  bracket: 'sw', swiss_group: group, round, player1_id: p1, player2_id: p2,
  score1: s1, score2: s2, winner_id: s1 > s2 ? p1 : p2, status: 'completed',
});

test('qualifiers are ordered by group rank first, then stats', () => {
  const field = players(8).map((p, i) => ({ ...p, swiss_group: i < 4 ? 1 : 2 }));
  const matches = [
    // Group A: p1 2-0 (game diff +4), p2 1-1
    done(1, 1, 'p1', 'p3', 2, 0), done(1, 1, 'p2', 'p4', 2, 0),
    done(2, 1, 'p1', 'p2', 2, 0), done(2, 1, 'p3', 'p4', 2, 1),
    // Group B: p5 2-0 (game diff +2), p6 1-1 (game diff +1, ahead of p7 at 0)
    done(1, 2, 'p5', 'p7', 1, 0), done(1, 2, 'p6', 'p8', 2, 0),
    done(2, 2, 'p5', 'p6', 1, 0), done(2, 2, 'p7', 'p8', 1, 0),
  ];
  const standings = groupStandings(field, matches);
  assert.deepEqual(standings.map((g) => g.label), ['A', 'B']);
  assert.equal(groupStageComplete(field, matches, 2), true);
  assert.equal(groupStageComplete(field, matches, 3), false);
  const { qualifiers, warnings } = selectQualifiers(standings, 2);
  // Group winners first (p1 has the better game diff), then runners-up: p6 (+1) before p2 (0).
  assert.deepEqual(qualifiers.map((q) => q.player_id), ['p1', 'p5', 'p6', 'p2']);
  assert.deepEqual(qualifiers.map((q) => q.group_rank), [1, 1, 2, 2]);
  assert.deepEqual(warnings, []);
});

test('a tie on the qualification line decided by seed is reported', () => {
  const field = players(4).map((p) => ({ ...p, swiss_group: 1 }));
  // p1 and p2 win, p3 and p4 lose with identical scores: 2nd vs 3rd is not a tie.
  // Qualify 3: p3 (3rd) and p4 (4th) are identical -> warning.
  const matches = [done(1, 1, 'p1', 'p3', 1, 0), done(1, 1, 'p2', 'p4', 1, 0)];
  const { warnings } = selectQualifiers(groupStandings(field, matches), 3);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].player_in, 'p3');
  assert.equal(warnings[0].player_out, 'p4');
  assert.match(warnings[0].message, /A 组第 3 名与第 4 名/);
});

test('first-round pairs match the bracket seeding, byes left out', () => {
  assert.deepEqual(firstRoundSeedPairs(4), [[1, 4], [2, 3]]);
  assert.deepEqual(firstRoundSeedPairs(6), [[4, 5], [3, 6]]);
  assert.deepEqual(firstRoundSeedPairs(8), [[1, 8], [4, 5], [2, 7], [3, 6]]);
});

test('same-group first-round meetings are avoided by swapping equal ranks', () => {
  // Two groups, two qualifiers each. Natural order A1, B1, B2, A2 would pair A1-A2? No:
  // seeds 1v4, 2v3 -> A1 vs A2 and B1 vs B2 when the runners-up are ordered B2, A2.
  const q = [
    { player_id: 'a1', group: 1, group_rank: 1 },
    { player_id: 'b1', group: 2, group_rank: 1 },
    { player_id: 'b2', group: 2, group_rank: 2 },
    { player_id: 'a2', group: 1, group_rank: 2 },
  ];
  const before = firstRoundSeedPairs(4).filter(([a, b]) => q[a - 1].group === q[b - 1].group).length;
  assert.equal(before, 2);
  const { seeded, sameGroupPairs } = seedPlayoffs(q);
  assert.equal(sameGroupPairs, 0);
  assert.deepEqual(seeded.map((x) => x.player_id).slice(0, 2), ['a1', 'b1'], 'group winners keep their seeds');
});

test('seeding keeps groups apart in larger fields and never moves players across ranks', () => {
  for (const [groups, k] of [[4, 2], [4, 4], [8, 2], [3, 2], [2, 3]]) {
    const q = [];
    for (let rank = 1; rank <= k; rank += 1) {
      for (let g = 1; g <= groups; g += 1) q.push({ player_id: `g${g}r${rank}`, group: g, group_rank: rank });
    }
    const { seeded, sameGroupPairs } = seedPlayoffs(q);
    assert.equal(sameGroupPairs, 0, `${groups} groups x ${k}`);
    seeded.forEach((x, i) => assert.equal(x.group_rank, q[i].group_rank, 'rank tiers stay in place'));
  }
});

test('two-stage start checks', () => {
  const base = { rounds: 3, groupSize: 8, perGroup: 2, playoffFormat: 'single_elim' };
  assert.equal(twoStageStartBlockedReason(32, base), null);
  assert.equal(twoStageStartBlockedReason(32, { ...base, rounds: null }), null, 'automatic rounds');
  assert.match(twoStageStartBlockedReason(32, { ...base, rounds: 0 }), /轮数/);
  // A group of 3 can play 3 rounds without a rematch (everyone sits out once).
  assert.equal(twoStageStartBlockedReason(6, { ...base, groupSize: 3, perGroup: 1, rounds: 3 }), null);
  assert.match(twoStageStartBlockedReason(32, { ...base, playoffFormat: null }), /淘汰赛赛制/);
  // 9 players, size 8 -> 2 groups of 5 and 4: 4 rounds is too many for the group of 4.
  assert.equal(
    twoStageStartBlockedReason(9, { ...base, rounds: 4 }),
    '最小的组只有 4 人，最多只能打 3 轮瑞士轮（当前设置 4 轮）',
  );
  assert.equal(twoStageStartBlockedReason(9, { ...base, perGroup: 5 }), '每组晋级 5 人，但最小的组只有 4 人');
  assert.equal(
    twoStageStartBlockedReason(8, { ...base, perGroup: 2, playoffFormat: 'double_elim', rounds: 3 }),
    '双败淘汰赛至少需要 4 名晋级选手（当前 1 组 × 2 = 2 人）',
  );
  assert.match(twoStageStartBlockedReason(3, { ...base, groupSize: 2, rounds: 1 }), /每组不足 2 人/);
});

test('simulated group stages pair only within groups', () => {
  const field = players(30);
  const groups = assignGroups(field, groupCountFor(30, 8));
  const withGroups = field.map((p) => ({ ...p, swiss_group: groups.get(p.id) }));
  const matches = [];
  for (let round = 1; round <= 3; round += 1) {
    for (let g = 1; g <= 4; g += 1) {
      const own = withGroups.filter((p) => p.swiss_group === g);
      const prior = matches.filter((m) => m.swiss_group === g);
      for (const pair of pairSwissRound(own, prior, round)) {
        if (!pair.player2_id) {
          matches.push({ ...done(round, g, pair.player1_id, null, 0, 0), winner_id: pair.player1_id });
          continue;
        }
        assert.equal(groups.get(pair.player1_id), groups.get(pair.player2_id), 'cross-group pairing');
        matches.push(done(round, g, pair.player1_id, pair.player2_id, 1, 0));
      }
    }
  }
  assert.equal(groupStageComplete(withGroups, matches, 3), true);
  const { qualifiers } = selectQualifiers(groupStandings(withGroups, matches), 2);
  assert.equal(qualifiers.length, 8);
  assert.equal(seedPlayoffs(qualifiers).sameGroupPairs, 0);
});
