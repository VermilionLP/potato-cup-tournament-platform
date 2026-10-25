import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMmrSeries } from "../src/lib/ladder.js";

const history = [
  {
    game_id: 2,
    player_id: "p1",
    opponent_name: "b",
    mmr_before: 3050,
    mmr_after: 3100,
    mmr_delta: 50,
    played_at: "2026-02-01T20:00:00+08:00",
    score_for: 1,
    score_against: 0,
  },
  {
    game_id: 1,
    player_id: "p1",
    opponent_name: "a",
    mmr_before: 3000,
    mmr_after: 3050,
    mmr_delta: 50,
    played_at: "2026-01-01T20:00:00+08:00",
    score_for: 1,
    score_against: 0,
  },
];

test("buildMmrSeries starts at the pre-game MMR on the game axis", () => {
  const series = buildMmrSeries(history, "game");
  assert.deepEqual(
    series.map((p) => [p.x, p.y]),
    [
      [0, 3000],
      [1, 3050],
      [2, 3100],
    ]
  );
  assert.equal(series[0].meta, null);
  assert.equal(series[1].meta.game_id, 1);
});

test("buildMmrSeries is chronological on the time axis", () => {
  const series = buildMmrSeries(history, "time");
  assert.equal(series.length, 2);
  assert.ok(series[0].x < series[1].x);
  assert.equal(series[0].meta.game_id, 1);
  assert.equal(series[1].y, 3100);
});

test("buildMmrSeries drops invalid timestamps and handles empty input", () => {
  assert.deepEqual(buildMmrSeries([], "time"), []);
  const series = buildMmrSeries(
    [
      { ...history[0], played_at: "not-a-date" },
      history[1],
    ],
    "time"
  );
  assert.equal(series.length, 1);
  assert.equal(series[0].meta.game_id, 1);
});
