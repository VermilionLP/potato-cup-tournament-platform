import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeStandings,
  currentSwissRound,
  effectiveSwissRounds,
  minPlayersForRounds,
  pairSwissRound,
  parseSwissRounds,
  roundRobinPairs,
  roundRobinRounds,
  suggestedSwissRounds,
  swissRoundComplete,
  swissStartBlockedReason,
} from '../lib/swiss.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));

const done = (round, p1, p2, s1, s2) => ({
  bracket: 'sw',
  round,
  player1_id: p1,
  player2_id: p2,
  score1: s1,
  score2: s2,
  winner_id: s1 > s2 ? p1 : p2,
  status: 'completed',
});

const bye = (round, p) => ({
  bracket: 'sw',
  round,
  player1_id: p,
  player2_id: null,
  score1: 0,
  score2: 0,
  winner_id: p,
  status: 'completed',
});

test('round counts: suggestion is ceil(log2 N), admin input is validated', () => {
  assert.equal(suggestedSwissRounds(8), 3);
  assert.equal(suggestedSwissRounds(9), 4);
  assert.equal(suggestedSwissRounds(16), 4);
  assert.equal(parseSwissRounds('5'), 5);
  assert.equal(parseSwissRounds(0), null);
  assert.equal(parseSwissRounds(2.5), null);
  assert.equal(parseSwissRounds(''), null);
  assert.equal(parseSwissRounds(16), null);
});

test('start needs enough players for the rounds; no round count means automatic', () => {
  assert.equal(swissStartBlockedReason(8, null), null);
  assert.equal(swissStartBlockedReason(8, 'auto'), null);
  assert.match(swissStartBlockedReason(8, 0), /请先设置瑞士轮轮数/);
  assert.equal(swissStartBlockedReason(4, 4), '瑞士轮 4 轮至少需要 5 名选手（当前 4 人）');
  assert.equal(swissStartBlockedReason(5, 4), null);
  assert.equal(swissStartBlockedReason(5, 5), null, 'odd fields can play n rounds');
  assert.equal(swissStartBlockedReason(4, 5), '瑞士轮 5 轮至少需要 5 名选手（当前 4 人）');
});

test('automatic rounds are a full round robin, capped at 15', () => {
  assert.equal(roundRobinRounds(4), 3);
  assert.equal(roundRobinRounds(5), 5);
  assert.equal(roundRobinRounds(8), 7);
  assert.equal(effectiveSwissRounds(null, 4), 3);
  assert.equal(effectiveSwissRounds(null, 3), 3);
  assert.equal(effectiveSwissRounds(null, 40), 15);
  assert.equal(effectiveSwissRounds(2, 8), 2, 'an explicit value wins');
  assert.equal(minPlayersForRounds(3), 3);
  assert.equal(minPlayersForRounds(4), 5);
});

test('round-robin schedule: everyone meets everyone once, odd fields sit out once each', () => {
  for (let n = 2; n <= 13; n += 1) {
    const field = players(n);
    const met = new Set();
    const byes = new Map();
    for (let round = 1; round <= roundRobinRounds(n); round += 1) {
      const seen = new Set();
      for (const p of roundRobinPairs(field, round)) {
        for (const id of [p.player1_id, p.player2_id].filter(Boolean)) {
          assert.ok(!seen.has(id), `n=${n} r=${round}: ${id} twice`);
          seen.add(id);
        }
        if (!p.player2_id) {
          byes.set(p.player1_id, (byes.get(p.player1_id) || 0) + 1);
          continue;
        }
        const key = [p.player1_id, p.player2_id].sort().join('|');
        assert.ok(!met.has(key), `n=${n}: rematch ${key}`);
        met.add(key);
      }
      assert.equal(seen.size, n);
    }
    assert.equal(met.size, (n * (n - 1)) / 2, `n=${n}: every pair met`);
    if (n % 2 === 1) for (const p of field) assert.equal(byes.get(p.id), 1);
  }
});

test('Swiss pairing uses the round-robin schedule when the rounds cover it', () => {
  const field = players(4);
  assert.deepEqual(
    pairSwissRound(field, [], 1, { totalRounds: 3 }),
    roundRobinPairs(field, 1),
  );
  // Fewer rounds: ordinary Swiss round 1 (top half against bottom half).
  assert.deepEqual(
    pairSwissRound(field, [], 1, { totalRounds: 2 }).map((p) => [p.player1_id, p.player2_id]),
    [['p1', 'p3'], ['p2', 'p4']],
  );
});

test('round 1 pairs top half against bottom half by seed', () => {
  const pairs = pairSwissRound(players(8), [], 1);
  assert.deepEqual(
    pairs.map((p) => [p.player1_id, p.player2_id]),
    [['p1', 'p5'], ['p2', 'p6'], ['p3', 'p7'], ['p4', 'p8']],
  );
});

test('round 1 with an odd field gives the bye to the lowest seed', () => {
  const pairs = pairSwissRound(players(5), [], 1);
  assert.deepEqual(pairs.at(-1), { player1_id: 'p5', player2_id: null });
  assert.deepEqual(
    pairs.slice(0, -1).map((p) => [p.player1_id, p.player2_id]),
    [['p1', 'p3'], ['p2', 'p4']],
  );
});

test('standings: points, then game differential, then Buchholz', () => {
  // p1 beats p2 2-0, p3 beats p4 2-1. Round 2: p1 beats p3 2-1, p2 beats p4 2-0.
  const matches = [
    done(1, 'p1', 'p2', 2, 0),
    done(1, 'p3', 'p4', 2, 1),
    done(2, 'p1', 'p3', 2, 1),
    done(2, 'p2', 'p4', 2, 0),
  ];
  const table = computeStandings(players(4), matches);
  assert.deepEqual(table.map((r) => r.player_id), ['p1', 'p2', 'p3', 'p4']);
  const p2 = table.find((r) => r.player_id === 'p2');
  const p3 = table.find((r) => r.player_id === 'p3');
  // p2 and p3 are both 1-1 with game diff 0, so Buchholz is compared next.
  assert.equal(p2.game_diff, 0);
  assert.equal(p3.game_diff, 0);
  assert.equal(p2.buchholz, 2 + 0); // opponents p1 (2) and p4 (0)
  assert.equal(p3.buchholz, 0 + 2); // opponents p4 (0) and p1 (2)
  // Same Buchholz too, so seed breaks the tie: p2 ahead of p3.
  assert.equal(p2.rank, 2);
});

test('game differential beats Buchholz', () => {
  const matches = [done(1, 'p1', 'p3', 3, 0), done(1, 'p2', 'p4', 1, 0)];
  const table = computeStandings(players(4), matches);
  assert.deepEqual(table.slice(0, 2).map((r) => r.player_id), ['p1', 'p2']);
  assert.equal(table[0].game_diff, 3);
  assert.equal(table[1].game_diff, 1);
});

test('a bye counts as a win with no opponent and no game differential', () => {
  const table = computeStandings(players(3), [bye(1, 'p3'), done(1, 'p1', 'p2', 2, 1)]);
  const p3 = table.find((r) => r.player_id === 'p3');
  assert.equal(p3.points, 1);
  assert.equal(p3.byes, 1);
  assert.equal(p3.game_diff, 0);
  assert.deepEqual(p3.opponents, []);
});

test('walkovers give the win but no game differential; pending matches are ignored', () => {
  const walkover = { ...done(1, 'p1', 'p2', 0, 0), winner_id: 'p2', status: 'walkover' };
  const pending = { ...done(1, 'p3', 'p4', 0, 0), winner_id: null, status: 'pending' };
  const table = computeStandings(players(4), [walkover, pending]);
  const p2 = table.find((r) => r.player_id === 'p2');
  assert.equal(p2.points, 1);
  assert.equal(p2.game_diff, 0);
  assert.equal(table.find((r) => r.player_id === 'p3').points, 0);
});

test('later rounds avoid rematches', () => {
  // After round 1 (p1>p5, p2>p6, p3>p7, p4>p8) the winners would be paired 1v2, 3v4.
  const r1 = [
    done(1, 'p1', 'p5', 1, 0),
    done(1, 'p2', 'p6', 1, 0),
    done(1, 'p3', 'p7', 1, 0),
    done(1, 'p4', 'p8', 1, 0),
  ];
  const pairs = pairSwissRound(players(8), r1, 2);
  assert.deepEqual(
    pairs.map((p) => [p.player1_id, p.player2_id]),
    [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6'], ['p7', 'p8']],
  );
  // Force a would-be rematch: p1 and p2 already met.
  const pairs2 = pairSwissRound(players(4), [done(1, 'p1', 'p2', 1, 0), done(1, 'p3', 'p4', 1, 0)], 2);
  for (const p of pairs2) {
    assert.notDeepEqual([p.player1_id, p.player2_id].sort(), ['p1', 'p2']);
  }
});

test('the bye goes to the lowest-ranked player who has not had one', () => {
  // p5 had the round 1 bye and is now top-ranked-ish; the bye must skip anyone who had one.
  const r1 = [bye(1, 'p5'), done(1, 'p1', 'p3', 1, 0), done(1, 'p2', 'p4', 1, 0)];
  const pairs = pairSwissRound(players(5), r1, 2);
  const roundBye = pairs.find((p) => p.player2_id === null);
  assert.equal(roundBye.player1_id, 'p4'); // p3 and p4 are 0-1; p4 ranks lower (seed)
});

test('round bookkeeping helpers', () => {
  const matches = [done(1, 'p1', 'p2', 1, 0), { ...done(2, 'p1', 'p2', 0, 0), status: 'pending', winner_id: null }];
  assert.equal(currentSwissRound(matches), 2);
  assert.equal(swissRoundComplete(matches, 1), true);
  assert.equal(swissRoundComplete(matches, 2), false);
  assert.equal(swissRoundComplete(matches, 3), false);
});

// Deterministic pseudo-random results so every run is reproducible.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('simulated tournaments: no rematches, at most one bye each, everyone plays every round', () => {
  for (let n = 4; n <= 24; n += 1) {
    const field = players(n);
    const rounds = Math.min(n - 1, suggestedSwissRounds(n) + 1);
    const rand = rng(n * 7919);
    const matches = [];
    for (let round = 1; round <= rounds; round += 1) {
      const pairs = pairSwissRound(field, matches, round);
      const seen = new Set();
      for (const p of pairs) {
        for (const id of [p.player1_id, p.player2_id].filter(Boolean)) {
          assert.ok(!seen.has(id), `n=${n} round=${round}: ${id} paired twice`);
          seen.add(id);
        }
        if (p.player2_id === null) {
          matches.push(bye(round, p.player1_id));
        } else {
          const s1 = rand() < 0.5 ? 2 : Math.floor(rand() * 2);
          const s2 = s1 === 2 ? Math.floor(rand() * 2) : 2;
          matches.push(done(round, p.player1_id, p.player2_id, s1, s2));
        }
      }
      assert.equal(seen.size, n, `n=${n} round=${round}: not everyone was scheduled`);
    }
    const pairsMet = new Set();
    const byes = new Map();
    for (const m of matches) {
      if (m.player2_id === null) {
        byes.set(m.player1_id, (byes.get(m.player1_id) || 0) + 1);
        continue;
      }
      const key = [m.player1_id, m.player2_id].sort().join('|');
      assert.ok(!pairsMet.has(key), `n=${n}: rematch ${key}`);
      pairsMet.add(key);
    }
    for (const [id, count] of byes) assert.equal(count, 1, `n=${n}: ${id} had ${count} byes`);
    const table = computeStandings(field, matches);
    assert.equal(table.reduce((s, r) => s + r.wins, 0), table.reduce((s, r) => s + r.losses, 0) + byes.size);
  }
});
