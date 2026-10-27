import assert from "node:assert/strict";
import { test } from "node:test";
import { POINTS_PRESETS, cleanTable, currentSeason, placeRangeLabel, pointsTableProblem } from "../src/lib/points.js";

test("presets and labels", () => {
  assert.deepEqual(POINTS_PRESETS[0].table.map((r) => r.points), [100, 60, 35, 10]);
  assert.equal(placeRangeLabel({ from: 3, to: 4 }), "第 3-4 名");
  assert.equal(placeRangeLabel({ from: 1, to: 1 }), "第 1 名");
  assert.equal(currentSeason(new Date("2026-12-31T17:00:00Z")), "2027", "Beijing time");
});

test("tables are checked before saving", () => {
  assert.equal(pointsTableProblem(POINTS_PRESETS[1].table, "2026"), "");
  assert.match(pointsTableProblem([], "2026"), /至少/);
  assert.match(pointsTableProblem(POINTS_PRESETS[0].table, "26"), /赛季/);
  assert.match(pointsTableProblem([{ from: "3", to: "2", points: 1 }], "2026"), /范围/);
  assert.match(pointsTableProblem([{ from: 1, to: 4, points: 1 }, { from: 3, to: 3, points: 1 }], "2026"), /重复/);
  assert.deepEqual(cleanTable([{ from: "5", to: "", points: "10" }, { from: "1", to: "1", points: "100" }]), [
    { from: 1, to: 1, points: 100 }, { from: 5, to: 5, points: 10 },
  ]);
});
