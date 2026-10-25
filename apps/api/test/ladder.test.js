import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASE_MMR,
  computeLadder,
  kForGames,
  randomizeSeedOrder,
  sortForSeeds,
  assignPercentileTiers,
} from "../lib/ladder.js";

function mulberry32(seed) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("computeLadder uses map score, not winner_id (classic SUCK)", () => {
  const games = [
    {
      id: 1,
      player1_id: "alice",
      player2_id: "bob",
      score1: 2,
      score2: 0,
      // In classic SUCK the bracket advancer is the loser; it must be ignored.
      winner_id: "bob",
      played_at: "2026-01-01T20:00:00+08:00",
    },
  ];
  const { players, history } = computeLadder(games);
  const alice = players.find((p) => p.id === "alice");
  const bob = players.find((p) => p.id === "bob");
  assert.equal(alice.wins, 1);
  assert.equal(bob.losses, 1);
  assert.ok(alice.rating > BASE_MMR);
  assert.ok(bob.rating < BASE_MMR);
  assert.equal(alice.rank, 1);
  assert.equal(history[0].opponent_rating_before, BASE_MMR);
  assert.ok(history[0].opponent_rating_after < BASE_MMR);
  assert.equal(history[1].opponent_rating_before, BASE_MMR);
  assert.ok(history[1].opponent_rating_after > BASE_MMR);
});

test("split series stay near the base MMR and are zero-sum per game", () => {
  const games = [
    { id: 1, player1_id: "a", player2_id: "b", score1: 2, score2: 1, played_at: "2026-01-01" },
    { id: 2, player1_id: "a", player2_id: "b", score1: 0, score2: 1, played_at: "2026-01-02" },
  ];
  const { players, history } = computeLadder(games);
  const a = players.find((p) => p.id === "a");
  const b = players.find((p) => p.id === "b");
  assert.equal(a.games, 2);
  assert.equal(a.wins, 1);
  assert.equal(b.wins, 1);
  for (let i = 0; i < history.length; i += 2) {
    const deltaSum = history[i].delta + history[i + 1].delta;
    assert.ok(Math.abs(deltaSum) < 1e-9, `game deltas should cancel, got ${deltaSum}`);
  }
  assert.ok(Math.abs(a.rating - BASE_MMR) < 250);
});

test("ties, mirror matches, and missing players are ignored", () => {
  const { players } = computeLadder([
    { id: 1, player1_id: "a", player2_id: "b", score1: 0, score2: 0 },
    { id: 2, player1_id: "a", player2_id: "a", score1: 1, score2: 0 },
    { id: 3, player1_id: null, player2_id: "b", score1: 1, score2: 0 },
  ]);
  assert.equal(players.length, 0);
});

test("K factor follows the provisional curve", () => {
  assert.equal(kForGames(0), 200);
  assert.equal(kForGames(9), 200);
  assert.equal(kForGames(10), 100);
  assert.equal(kForGames(29), 100);
  assert.equal(kForGames(30), 50);
});

test("percentile tiers follow the LotV league distribution", () => {
  const hundred = assignPercentileTiers(
    Array.from({ length: 100 }, (_, i) => ({ id: `p${i}` })),
  );
  const counts = {};
  for (const player of hundred) {
    counts[player.tier.group] = (counts[player.tier.group] || 0) + 1;
  }
  assert.deepEqual(counts, {
    master: 4,
    diamond: 23,
    platinum: 23,
    gold: 23,
    silver: 23,
    bronze: 4,
  });
  assert.equal(hundred[0].tier.key, "master-1");
  assert.equal(hundred[99].tier.key, "bronze-3");

  const small = assignPercentileTiers(
    Array.from({ length: 38 }, (_, i) => ({ id: `p${i}` })),
  );
  assert.equal(small.some((player) => player.tier.group === "grandmaster"), false);
  assert.equal(small[0].tier.group, "master");
  assert.equal(small[small.length - 1].tier.group, "bronze");
});

test("sortForSeeds puts rated players first by MMR, unrated last by registration", () => {
  const players = [
    { id: "u2", rating: 3000, games: 0, registered_at: "2026-01-02" },
    { id: "low", rating: 2900, games: 5, last_game_at: "2026-01-01" },
    { id: "u1", rating: 3000, games: 0, registered_at: "2026-01-01" },
    { id: "high", rating: 3200, games: 5, last_game_at: "2026-01-01" },
    { id: "tie", rating: 2900, games: 9, last_game_at: "2026-01-02" },
  ];
  assert.deepEqual(
    sortForSeeds(players).map((p) => p.id),
    ["high", "tie", "low", "u1", "u2"]
  );
});

test("randomizeSeedOrder is a permutation that keeps guards and rating bands", () => {
  const ratings = [
    ["a", 3400],
    ["b", 3390],
    ["c", 3380],
    ["d", 3200],
    ["e", 3190],
    ["f", 3180],
    ["g", 3000],
    ["h", 2990],
    ["i", 2980],
    ["j", 2970],
  ];
  const players = ratings.map(([id, rating]) => ({
    id,
    rating,
    games: 10,
    last_game_at: "2026-01-01",
  }));
  players.push(
    { id: "u1", rating: 3000, games: 0, registered_at: "2026-01-01" },
    { id: "u2", rating: 3000, games: 0, registered_at: "2026-01-02" }
  );

  const result = randomizeSeedOrder(players, {
    band: 80,
    keepTop: 2,
    keepBottom: 2,
    rng: mulberry32(42),
  });

  assert.equal(result.length, players.length);
  assert.deepEqual(
    [...result.map((p) => p.id)].sort(),
    [...players.map((p) => p.id)].sort()
  );
  // Guards: top 2 and bottom 2 stay put (the unrated pair is at the bottom).
  assert.deepEqual(result.slice(0, 2).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(result.slice(-2).map((p) => p.id), ["u1", "u2"]);
  // The d/e/f band (positions 3..5) may shuffle, but must stay that band.
  assert.deepEqual(
    new Set(result.slice(3, 6).map((p) => p.id)),
    new Set(["d", "e", "f"])
  );
  // Unrated players never move ahead of rated players.
  const firstUnrated = result.findIndex((p) => p.games === 0);
  assert.equal(firstUnrated, 10);
});

test("randomizeSeedOrder can shuffle an all-unrated field between the guards", () => {
  const players = Array.from({ length: 10 }, (_, i) => ({
    id: `p${i}`,
    rating: 3000,
    games: 0,
    registered_at: `2026-01-${String(i + 1).padStart(2, "0")}`,
  }));
  const result = randomizeSeedOrder(players, {
    keepTop: 2,
    keepBottom: 2,
    rng: mulberry32(7),
  });
  assert.equal(result.length, 10);
  assert.deepEqual(result.slice(0, 2).map((p) => p.id), ["p0", "p1"]);
  assert.deepEqual(result.slice(-2).map((p) => p.id), ["p8", "p9"]);
  assert.notDeepEqual(result.map((p) => p.id), players.map((p) => p.id));
});

test("randomizeSeedOrder handles tiny lists without moving players", () => {
  const players = [
    { id: "a", rating: 3000, games: 10 },
    { id: "b", rating: 2990, games: 10 },
  ];
  const result = randomizeSeedOrder(players, { rng: mulberry32(1) });
  assert.deepEqual(result.map((p) => p.id), ["a", "b"]);
});

