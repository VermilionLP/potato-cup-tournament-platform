import { test } from "node:test";
import assert from "node:assert/strict";
import { myActiveEvents, openToJoin, myRecentEvents } from "../src/lib/my-page.js";

const ev = (id, status, scheduled_time = "", extra = {}) => ({ id, status, scheduled_time, ...extra });

test("my events: running first, then by start time", () => {
  const list = [ev("a", "registration", "2026-12-05T20:00"), ev("b", "completed"), ev("c", "in_progress", "2026-11-01T20:00"), ev("d", "registration", "2026-12-01T20:00"), ev("e", "voting")];
  assert.deepEqual(myActiveEvents(list).map((t) => t.id), ["c", "d", "a", "e"]);
});

test("events to join leave out mine and finished ones", () => {
  const all = [ev("a", "registration", "2026-12-05T20:00"), ev("b", "registration", "2026-12-01T20:00"), ev("c", "in_progress"), ev("d", "voting"), ev("e", "registration", "2026-12-09T20:00")];
  assert.deepEqual(openToJoin(all, [{ id: "b" }]).map((t) => t.id), ["a", "e", "d"]);
  assert.deepEqual(openToJoin(all, [], 1).map((t) => t.id), ["b"]);
});

test("recent finished events, newest first", () => {
  const list = [ev("a", "completed", "", { played_at: "2026-01-01" }), ev("b", "completed", "", { played_at: "2026-03-01" }), ev("c", "registration")];
  assert.deepEqual(myRecentEvents(list).map((t) => t.id), ["b", "a"]);
});
