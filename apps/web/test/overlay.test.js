import assert from "node:assert/strict";
import { test } from "node:test";
import { matchStageLabels, overlayStages, pickStage, playersStillIn } from "../src/lib/overlay.js";

let id = 0;
const m = (bracket, round, position, p1, p2, winner = null, status = winner ? "completed" : "pending") => ({
  id: ++id, bracket, round, position, player1_id: p1, player2_id: p2, winner_id: winner, status,
});

// 4-player double elimination.
const de = [
  m("wb", 2, 1, "a", "b", "a"), m("wb", 2, 2, "c", "d", "c"),
  m("wb", 1, 1, "a", "c", "a"),
  m("lb", 2, 1, "b", "d", "d"),
  m("lb", 1, 1, "c", "d"),
  m("gf", 1, 1, null, null),
];

test("double elimination stages are not merged by round number", () => {
  const stages = overlayStages(de);
  // Playing order: the losers' first round runs alongside the winners' final.
  assert.deepEqual(stages.map((s) => s.key), ["wb:2", "lb:2", "wb:1", "lb:1", "gf:1"]);
  assert.deepEqual(stages.map((s) => s.label), ["胜者组第 1 轮", "败者组第 1 轮", "胜者组决赛", "败者组决赛", "总决赛"]);
  assert.deepEqual(stages.map((s) => s.short), ["WB1", "LB1", "WBF", "LBF", "GF"]);
  assert.equal(matchStageLabels(de[3], de).label, "败者组第 1 轮");
});

test("picking a stage: key, legacy round, else the current one", () => {
  const stages = overlayStages(de);
  assert.equal(pickStage(stages, "lb:2").key, "lb:2");
  assert.equal(pickStage(stages, "").key, "lb:1", "first stage with unplayed matches");
  assert.equal(pickStage(stages, "2").key, "lb:1", "a bare round number is ambiguous in double elimination");
  const sw = overlayStages([m("sw", 1, 1, "a", "b", "a"), m("sw", 2, 1, "a", "c")]);
  assert.deepEqual(sw.map((s) => [s.key, s.label, s.short]), [["sw:1", "瑞士轮 第 1 轮", "R1"], ["sw:2", "瑞士轮 第 2 轮", "R2"]]);
  assert.equal(pickStage(sw, "2").key, "sw:2");
  assert.equal(pickStage(sw).key, "sw:2");
});

test("byes are left out; a stage of byes disappears", () => {
  const stages = overlayStages([m("main", 2, 1, "a", null, "a"), m("main", 2, 2, "b", "c", "b"), m("main", 1, 1, "a", "b")]);
  assert.deepEqual(stages.map((s) => [s.key, s.matches.length, s.label]), [["main:2", 1, "半决赛"], ["main:1", 1, "总决赛"]]);
});

test("who is still in", () => {
  const players = ["a", "b", "c", "d"].map((x) => ({ id: x }));
  // b and d lost once in the winners bracket; b then lost in the losers bracket.
  assert.deepEqual([...playersStillIn(players, de)].sort(), ["a", "c", "d"]);
  const se = [m("main", 2, 1, "a", "b", "a"), m("main", 2, 2, "c", "d", "c")];
  assert.deepEqual([...playersStillIn(players, se)].sort(), ["a", "c"]);
  assert.equal(playersStillIn(players, [m("sw", 1, 1, "a", "b", "a")], { swiss: true }), null);
});

test("a finished event shows its last played stage, not an empty reset match", () => {
  const done = [
    m("wb", 1, 1, "a", "b", "a"), m("lb", 1, 1, "b", "c", "b"),
    m("gf", 1, 1, "a", "b", "a"), m("gf", 1, 2, null, null),
  ];
  assert.equal(pickStage(overlayStages(done), "6").key, "gf:1");
});
