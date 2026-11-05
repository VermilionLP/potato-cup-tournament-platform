import { test } from "node:test";
import assert from "node:assert/strict";
import { headToHead, modeRows, opponentsOf, poolRows, pointsRows } from "../src/lib/player-profile.js";

const h = (opponent_id, won, f, a) => ({ opponent_id, opponent_name: opponent_id.toUpperCase(), won, score_for: f, score_against: a });
const history = [h("b", true, 2, 1), h("c", false, 0, 2), h("b", false, 1, 2), h("b", true, 2, 0)];

test("opponents and head-to-head from the ladder history", () => {
  assert.deepEqual(opponentsOf(history).map((o) => [o.id, o.won, o.lost]), [["b", 2, 1], ["c", 0, 1]]);
  const vsB = headToHead(history, "b");
  assert.deepEqual([vsB.won, vsB.lost, vsB.mapsFor, vsB.mapsAgainst], [2, 1, 5, 3]);
  assert.equal(vsB.games.length, 3);
  assert.equal(headToHead(history, "zz").games.length, 0);
});

test("records per event type and mode: played ones only, most played first", () => {
  const rows = poolRows({ prop: { tournaments: 2, matches_won: 3, matches_lost: 1 }, proleague: { tournaments: 1, matches_won: 0, matches_lost: 1 }, "top-jet": {} });
  assert.deepEqual(rows.map((r) => r.id), ["prop", "proleague"]);
  assert.equal(rows[0].rate, 0.75);
  assert.equal(modeRows({}).length, 0);
});

test("points per board", () => {
  const boards = [{ pool: "prop", players: [{ id: "a", rank: 2, total: 30, events: 3 }, { id: "b", rank: 1, total: 40, events: 3 }] }, { pool: "proleague", players: [] }];
  assert.deepEqual(pointsRows(boards, "a"), [{ pool: "prop", name: "螺旋桨", rank: 2, total: 30, events: 3, of: 2 }]);
});

test("recent form and the MMR sparkline", async () => {
  const { recentForm, mmrSparkline } = await import("../src/lib/player-profile.js");
  const history = [
    { game_id: 3, won: true, opponent_name: "B", score_for: 2, score_against: 1, mmr_before: 3010, mmr_after: 3030, tournament_name: "W3" },
    { game_id: 2, won: false, opponent_name: "C", score_for: 0, score_against: 2, mmr_before: 3020, mmr_after: 3010 },
    { game_id: 1, won: true, opponent_name: "D", score_for: 2, score_against: 0, mmr_before: 3000, mmr_after: 3020 },
  ];
  assert.deepEqual(recentForm(history, 2).map((g) => [g.won, g.opponent, g.score]), [[true, "B", "2 : 1"], [false, "C", "0 : 2"]]);
  const s = mmrSparkline(history, { width: 30, height: 12 });
  assert.equal(s.min, 3000);
  assert.equal(s.max, 3030);
  assert.equal(s.up, true);
  assert.equal(s.points.split(" ").length, 4);
  assert.equal(s.points.split(" ")[0], "0.0,10.0");
  assert.equal(mmrSparkline([]), null);
});
