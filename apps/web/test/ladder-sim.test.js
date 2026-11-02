import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateMatch, kForGames, expectedScore, BASE_MMR, PROVISIONAL_GAMES } from "../src/lib/ladder-sim.js";
import * as server from "../../api/lib/ladder.js";

test("same rule as the server's ladder", () => {
  assert.equal(BASE_MMR, server.BASE_MMR);
  assert.equal(PROVISIONAL_GAMES, server.PROVISIONAL_GAMES);
  for (const g of [0, 9, 10, 29, 30, 200]) assert.equal(kForGames(g), server.kForGames(g), `K at ${g} games`);
  assert.equal(expectedScore(3100, 2900), server.expectedScore(3100, 2900));
});

test("matches computeLadder for a new game", () => {
  // Two established players built from history, then one more game.
  const games = [];
  for (let i = 0; i < 40; i += 1) games.push({ id: i, player1_id: i % 3 ? "a" : "c", player2_id: "b", score1: 2, score2: i % 4 ? 0 : 3 });
  const before = server.computeLadder(games).players;
  const pa = before.find((p) => p.id === "a");
  const pb = before.find((p) => p.id === "b");
  const after = server.computeLadder([...games, { id: 99, player1_id: "a", player2_id: "b", score1: 2, score2: 1 }]).players;
  const sim = simulateMatch({ ladder_mmr: pa.rating, ladder_games: pa.games }, { ladder_mmr: pb.rating, ladder_games: pb.games });
  assert.equal(sim.ifAWins.a.after, after.find((p) => p.id === "a").mmr);
  assert.equal(sim.ifAWins.b.after, after.find((p) => p.id === "b").mmr);
});

test("unrated players start at 3000 with the provisional K", () => {
  const sim = simulateMatch({ ladder_mmr: null, ladder_games: 0 }, {});
  assert.deepEqual(sim.ifAWins, { a: { after: 3100, delta: 100 }, b: { after: 2900, delta: -100 } });
  assert.equal(sim.a.provisional, true);
  assert.equal(sim.winChanceA, 0.5);
  const uneven = simulateMatch({ ladder_mmr: 3400, ladder_games: 50 }, { ladder_mmr: 3000, ladder_games: 50 });
  assert.ok(uneven.ifAWins.a.delta < 10 && uneven.ifBWins.a.delta < -40, "favourite gains little, loses a lot");
});
