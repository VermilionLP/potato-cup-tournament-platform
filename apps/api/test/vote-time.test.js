import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameVoteTime, normalizeVoteTime } from "../lib/vote-time.js";

test("normalizeVoteTime accepts ISO and display forms", () => {
  assert.equal(normalizeVoteTime("2026-10-25T20:00:00"), "2026-10-25 20:00");
  assert.equal(normalizeVoteTime("2026-10-25 (周日) 20:00"), "2026-10-25 20:00");
  assert.equal(normalizeVoteTime("2026-10-25 9:05"), "2026-10-25 09:05");
  assert.equal(normalizeVoteTime("not a time"), null);
});

test("isSameVoteTime compares date and minute", () => {
  assert.equal(isSameVoteTime("2026-10-25T20:00:00", "2026-10-25 (周日) 20:00"), true);
  assert.equal(isSameVoteTime("2026-10-25T20:00:00", "2026-10-25 21:00"), false);
  assert.equal(isSameVoteTime("2026-10-25T20:00:00", null), false);
});
