import { test } from "node:test";
import assert from "node:assert/strict";
import { currentTabKey, roundTabs } from "../src/lib/round-list.js";

const m = (id, round, o = {}) => ({ id, bracket: "main", round, position: id, player1_id: "a", player2_id: "b", status: "pending", winner_id: null, ...o });
const label = (x) => ({ 3: "第 1 轮", 2: "半决赛", 1: "决赛", 0: "三四名决赛" })[x.round];

test("one tab per round in playing order; byes left out; third place with the final", () => {
  const ms = [
    m(1, 3, { status: "completed", winner_id: "a" }), m(2, 3, { status: "completed", winner_id: "a", player2_id: null }),
    m(3, 3), m(4, 3), m(5, 2), m(6, 2, { player1_id: null, player2_id: null }), m(7, 1, { player1_id: null, player2_id: null }), m(8, 0, { player1_id: null, player2_id: null }),
  ];
  const order = new Map([[1, 1], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 7]]);
  const tabs = roundTabs(ms, label, order);
  assert.deepEqual(tabs.map((t) => [t.label, t.matches.map((x) => x.id), t.done, t.total]), [
    ["第 1 轮", [1, 3, 4], 1, 3],
    ["半决赛", [5, 6], 0, 2],
    ["决赛", [7, 8], 0, 2],
  ]);
  assert.equal(currentTabKey(tabs), "main:3");
});

test("the current round moves on; a finished bracket opens on the final", () => {
  const done = { status: "completed", winner_id: "a" };
  const tabs = roundTabs([m(1, 2, done), m(2, 2, done), m(3, 1)], label);
  assert.equal(currentTabKey(tabs), "main:1");
  assert.equal(currentTabKey(roundTabs([m(1, 2, done), m(3, 1, done)], label)), "main:1");
  assert.equal(currentTabKey([]), "");
});

test("double elimination: rounds in the order they are played", () => {
  // 8 players: winners rounds 3..1, losers rounds 4..1, grand final (and reset).
  const ms = [
    ...[3, 2, 1].map((r, i) => m(10 + i, r, { bracket: "wb" })),
    ...[4, 3, 2, 1].map((r, i) => m(20 + i, r, { bracket: "lb" })),
    m(30, 1, { bracket: "gf", position: 1 }),
  ];
  // The site's play order puts every losers round before the winners round with the same number.
  const order = new Map([[20, 1], [10, 2], [21, 3], [11, 4], [22, 5], [12, 6], [23, 7], [30, 8]]);
  const tabs = roundTabs(ms, (x) => `${x.bracket}${x.round}`, order);
  assert.deepEqual(tabs.map((t) => t.label), ["wb3", "lb4", "wb2", "lb3", "lb2", "wb1", "lb1", "gf1"]);
});
