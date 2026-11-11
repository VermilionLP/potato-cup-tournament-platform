import { test } from "node:test";
import assert from "node:assert/strict";
import { beijingValue, revealDate, move, isLocked, dayText } from "../src/lib/season-top.js";

test("Beijing time values for the start picker", () => {
  assert.equal(beijingValue("2026-12-01T12:00:00.000Z"), "2026-12-01T20:00");
  assert.equal(beijingValue("2026-12-31T17:30:00.000Z"), "2027-01-01T01:30");
  assert.equal(beijingValue(null), "");
  assert.equal(dayText("2026-12-01T17:00:00.000Z"), "2026-12-02");
});

test("one place a day from the last up", () => {
  const start = "2026-12-01T12:00:00.000Z";
  assert.equal(revealDate(start, 20, 20).toISOString(), start);
  assert.equal(revealDate(start, 1, 20).toISOString(), "2026-12-20T12:00:00.000Z");
  assert.equal(revealDate(start, 0, 20), null);
  assert.equal(revealDate("", 1, 20), null);
});

test("moving players and the revealed lock", () => {
  assert.deepEqual(move(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(move(["a", "b", "c"], 2, 1), ["a", "b", "c"]);
  assert.equal(isLocked(19, 20, 2), true);
  assert.equal(isLocked(18, 20, 2), true);
  assert.equal(isLocked(17, 20, 2), false);
  assert.equal(isLocked(0, 20, 0), false);
});
