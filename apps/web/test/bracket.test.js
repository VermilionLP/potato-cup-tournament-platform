import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bracketConnectorPath,
  bracketRoundLabel,
  bracketRoundTotal,
  buildMatchOrder,
  displayRound,
  groupBracketRounds,
  layoutBracketBand,
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

test("double-elimination rounds group by bracket and keep first round first", () => {
  const matches = [
    { id: 1, bracket: "wb", round: 3, position: 1 },
    { id: 2, bracket: "wb", round: 3, position: 2 },
    { id: 3, bracket: "wb", round: 1, position: 1 },
    { id: 4, bracket: "lb", round: 4, position: 1 },
    { id: 5, bracket: "lb", round: 1, position: 1 },
    { id: 6, bracket: "gf", round: 1, position: 1 },
  ];
  const wb = groupBracketRounds(matches, "wb");
  assert.deepEqual(wb.map((r) => r.round), [3, 1]);
  assert.deepEqual(wb[0].matches.map((m) => m.id), [1, 2]);
  assert.deepEqual(groupBracketRounds(matches, "lb").map((r) => r.round), [4, 1]);
  assert.equal(bracketRoundTotal(matches, "lb"), 4);
});

test("double-elimination round headers name the bracket", () => {
  assert.equal(bracketRoundLabel("wb", 1, 3), "胜者组决赛");
  assert.equal(bracketRoundLabel("wb", 2, 3), "胜者组第 2 轮");
  assert.equal(bracketRoundLabel("wb", 3, 3), "胜者组第 1 轮");
  assert.equal(bracketRoundLabel("lb", 1, 4), "败者组决赛");
  assert.equal(bracketRoundLabel("lb", 3, 4), "败者组第 2 轮");
  assert.equal(bracketRoundLabel("gf", 1, 1), "总决赛");
});

test("bracket layout centres each round between the matches that feed it", () => {
  const matches = [
    { id: 1, bracket: "wb", round: 3, position: 1, next_match_id: 5 },
    { id: 2, bracket: "wb", round: 3, position: 2, next_match_id: 5 },
    { id: 3, bracket: "wb", round: 3, position: 3, next_match_id: 6 },
    { id: 4, bracket: "wb", round: 3, position: 4, next_match_id: 6 },
    { id: 5, bracket: "wb", round: 2, position: 1, next_match_id: 7 },
    { id: 6, bracket: "wb", round: 2, position: 2, next_match_id: 7 },
    { id: 7, bracket: "wb", round: 1, position: 1, next_match_id: null },
  ];
  const band = layoutBracketBand(matches, "wb", {
    cardHeight: 76,
    slotHeight: 104,
    columnWidth: 220,
    columnGap: 52,
  });

  assert.deepEqual(
    band.columns[0].matches.map((item) => item.y),
    [38, 142, 246, 350],
  );
  assert.deepEqual(
    band.columns[1].matches.map((item) => item.y),
    [90, 298],
  );
  assert.deepEqual(
    band.columns[2].matches.map((item) => item.y),
    [194],
  );
  assert.equal(band.width, 764);
  assert.equal(band.height, 388);
});

test("one-to-one cross feeds keep their row in the layout", () => {
  const matches = [
    { id: 10, bracket: "lb", round: 2, position: 1, next_match_id: 12 },
    { id: 11, bracket: "lb", round: 2, position: 2, next_match_id: 13 },
    { id: 12, bracket: "lb", round: 1, position: 1, next_match_id: null },
    { id: 13, bracket: "lb", round: 1, position: 2, next_match_id: null },
  ];
  const band = layoutBracketBand(matches, "lb", {
    cardHeight: 76,
    slotHeight: 104,
    columnWidth: 220,
    columnGap: 52,
  });
  assert.deepEqual(
    band.columns[0].matches.map((item) => item.y),
    [38, 142],
  );
  assert.deepEqual(
    band.columns[1].matches.map((item) => item.y),
    [38, 142],
  );
});

test("connector paths are straight on one row and elbow otherwise", () => {
  assert.equal(
    bracketConnectorPath({ x: 0, y: 50 }, { x: 100, y: 50 }, 220),
    "M 220 50 L 100 50",
  );
  assert.equal(
    bracketConnectorPath({ x: 0, y: 50 }, { x: 300, y: 150 }, 220),
    "M 220 50 L 260 50 L 260 150 L 300 150",
  );
});
