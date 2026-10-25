import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMatchOrder,
  displayRound,
  maxRound,
  playableMatchIds,
  roundLabel,
  roundShortLabel,
} from "../src/lib/bracket.js";

test("round labels count up from the first round", () => {
  // 16-player bracket: internal round 4 is the first round.
  assert.equal(roundLabel(4, 4), "第 1 轮");
  assert.equal(roundLabel(3, 4), "四分之一决赛");
  assert.equal(roundLabel(2, 4), "半决赛");
  assert.equal(roundLabel(1, 4), "总决赛");
  assert.equal(roundLabel(0, 4), "三四名决赛");

  // 8-player bracket: the first round is the quarterfinal.
  assert.equal(roundLabel(3, 3), "四分之一决赛");
  assert.equal(roundLabel(2, 3), "半决赛");
  assert.equal(roundLabel(1, 3), "总决赛");
});

test("128-player round labels stay in ascending display order", () => {
  // 128 players => 7 internal rounds; round 7 is the first round.
  assert.equal(roundLabel(7, 7), "第 1 轮");
  assert.equal(roundLabel(6, 7), "第 2 轮");
  assert.equal(roundLabel(5, 7), "第 3 轮");
  assert.equal(roundLabel(4, 7), "第 4 轮");
  assert.equal(roundLabel(3, 7), "四分之一决赛");
  assert.equal(roundLabel(2, 7), "半决赛");
  assert.equal(roundLabel(1, 7), "总决赛");
});

test("displayRound and roundShortLabel", () => {
  assert.equal(displayRound(4, 4), 1);
  assert.equal(displayRound(0, 4), 0);
  assert.equal(roundShortLabel(4, 4), "R1");
  assert.equal(roundShortLabel(3, 4), "QF");
  assert.equal(roundShortLabel(2, 4), "SF");
  assert.equal(roundShortLabel(1, 4), "F");
  assert.equal(roundShortLabel(0, 4), "3RD");
});

test("buildMatchOrder numbers first round first, stable across statuses", () => {
  const matches = [
    { id: 10, round: 2, position: 1 },
    { id: 11, round: 2, position: 2 },
    { id: 20, round: 1, position: 1 },
    { id: 30, round: 0, position: 1 },
  ];
  const order = buildMatchOrder(matches);
  assert.equal(order.get(10), 1);
  assert.equal(order.get(11), 2);
  assert.equal(order.get(20), 3);
  assert.equal(order.get(30), 4);

  // Completing a match must not renumber the remaining ones.
  const after = buildMatchOrder(matches.map((m) => (m.id === 10 ? { ...m, status: "completed" } : m)));
  assert.equal(after.get(10), 1);
  assert.equal(after.get(20), 3);
});

test("playableMatchIds skips TBD/completed matches and sorts by bracket order", () => {
  const matches = [
    { id: 10, round: 2, position: 1, status: "completed", player1_id: "a", player2_id: "b" },
    { id: 11, round: 2, position: 2, status: "pending", player1_id: "c", player2_id: "d" },
    { id: 20, round: 1, position: 1, status: "pending", player1_id: "a", player2_id: "c" },
    { id: 21, round: 1, position: 2, status: "pending", player1_id: "b", player2_id: null },
  ];
  assert.deepEqual(playableMatchIds(matches), [11, 20]);
});

test("maxRound ignores missing and zero rounds", () => {
  assert.equal(maxRound([]), 1);
  assert.equal(maxRound([{ round: 0 }, { round: 3 }, { round: 2 }]), 3);
});
