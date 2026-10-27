import assert from "node:assert/strict";
import { test } from "node:test";
import { eliminationStandings, placeLabel } from "../src/lib/standings.js";

const m = (bracket, round, position, p1, p2, winner, status = "completed") => ({
  bracket, round, position, player1_id: p1, player2_id: p2, winner_id: winner, status,
});
const players = (...ids) => ids.map((id) => ({ id }));
const ranks = (rows) => rows.map((r) => `${r.rank}:${r.id}`);

test("place labels", () => {
  assert.equal(placeLabel(1, 1), "第 1 名 (冠军)");
  assert.equal(placeLabel(2, 2), "第 2 名 (亚军)");
  assert.equal(placeLabel(3, 3), "第 3 名");
  assert.equal(placeLabel(9, 16), "第 9 - 16 名");
});

test("single elimination: ordered by placing, not by the player list", () => {
  // 5 players: e has a bye in round 3 (rounds count down, 1 = final).
  const matches = [
    m("main", 3, 1, "a", "b", "a"),
    m("main", 3, 2, "e", null, "e"),
    m("main", 2, 1, "a", "c", "c"),
    m("main", 2, 2, "e", "d", "e"),
    m("main", 1, 1, "c", "e", "e"),
  ];
  const rows = eliminationStandings({ matches, players: players("a", "b", "c", "d", "e"), championshipMatch: matches[4] });
  assert.deepEqual(ranks(rows), ["第 1 名 (冠军):e", "第 2 名 (亚军):c", "第 3 - 4 名:a", "第 3 - 4 名:d", "第 5 名:b"]);
  assert.deepEqual([rows[0].matchesWon, rows[0].matchesPlayed], [2, 2], "a bye is not a played match");
});

test("single elimination with a third-place match", () => {
  const matches = [
    m("main", 2, 1, "a", "b", "a"),
    m("main", 2, 2, "c", "d", "c"),
    m("main", 1, 1, "a", "c", "c"),
    m("main", 0, 1, "b", "d", "d"),
  ];
  const rows = eliminationStandings({ matches, players: players("a", "b", "c", "d"), championshipMatch: matches[2] });
  assert.deepEqual(ranks(rows), ["第 1 名 (冠军):c", "第 2 名 (亚军):a", "第 3 名:d", "第 4 名:b"]);
});

test("double elimination: losers-bracket rounds from the final backwards", () => {
  const matches = [
    m("wb", 2, 1, "a", "b", "a"),
    m("wb", 2, 2, "c", "d", "c"),
    m("wb", 1, 1, "a", "c", "a"),
    m("lb", 2, 1, "b", "d", "d"),
    m("lb", 1, 1, "c", "d", "c"),
    m("gf", 1, 1, "a", "c", "c"),
    m("gf", 1, 2, "a", "c", "a"),
  ];
  const rows = eliminationStandings({
    matches, players: players("b", "d", "c", "a"), doubleElim: true, championshipMatch: matches[6],
  });
  assert.deepEqual(ranks(rows), ["第 1 名 (冠军):a", "第 2 名 (亚军):c", "第 3 名:d", "第 4 名:b"]);
});

test("unfinished event: players still in come first", () => {
  const matches = [m("main", 2, 1, "a", "b", "a"), m("main", 2, 2, "c", "d", null, "pending"), m("main", 1, 1, "a", null, null, "pending")];
  const rows = eliminationStandings({ matches, players: players("b", "a", "c", "d"), championshipMatch: matches[2] });
  assert.deepEqual(ranks(rows), ["未淘汰:a", "未淘汰:c", "未淘汰:d", "第 4 名:b"]);
});
