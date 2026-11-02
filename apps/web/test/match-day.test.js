import { test } from "node:test";
import assert from "node:assert/strict";
import { matchDayBoard, minutesToAutoConfirm } from "../src/lib/match-day.js";

const m = (id, o = {}) => ({ id, bracket: "main", round: 1, position: id, player1_id: "a" + id, player2_id: "b" + id, status: "pending", winner_id: null, pending_report: null, ...o });
const now = Date.parse("2026-11-03T12:00:00Z");

test("the board sorts matches into live, to settle, to confirm, ready and waiting", () => {
  const t = {
    status: "in_progress",
    players: [],
    live_channels: [{ channel: 1, active_match_id: 2 }, { channel: 2, active_match_id: null }],
    matches: [
      m(1, { status: "completed", winner_id: "a1" }),
      m(2),
      m(3, { pending_report: { kind: "score", by: "a3", score1: 2, score2: 0, at: "2026-11-03T11:57:00Z", disputed: false } }),
      m(4, { pending_report: { kind: "score", by: "a4", disputed: true, at: "2026-11-03T11:50:00Z" } }),
      m(5, { pending_report: { kind: "walkover", by: "a5", winner_id: "a5", disputed: false, at: "2026-11-03T11:50:00Z" } }),
      m(6),
      m(7, { player2_id: null }),
      m(8, { player1_id: null, player2_id: null }),
    ],
  };
  const b = matchDayBoard(t, new Map([[6, 1], [2, 2]]), now);
  assert.deepEqual(b.live.map((x) => [x.channel, x.match.id]), [[1, 2]]);
  assert.deepEqual(b.disputed.map((x) => x.id), [4, 5]);
  assert.deepEqual(b.toConfirm.map((x) => [x.match.id, x.minutes]), [[3, 7]]);
  assert.deepEqual(b.ready.map((x) => x.id), [6], "the live match is not 'ready'");
  assert.deepEqual(b.waiting.map((x) => x.id), [7]);
  assert.deepEqual([b.done, b.total], [1, 6], "empty slots are not counted yet");
});

test("check-in before the start", () => {
  const t = { status: "registration", checkin: { enabled: true }, players: [{ id: "a", checked_in_at: "x" }, { id: "b" }], matches: [] };
  const b = matchDayBoard(t);
  assert.deepEqual(b.absent.map((p) => p.id), ["b"]);
  assert.equal(b.checkedIn, 1);
  assert.equal(matchDayBoard({ ...t, checkin: { enabled: false } }).absent.length, 0);
});

test("minutes before an undisputed score takes effect", () => {
  assert.equal(minutesToAutoConfirm({ at: "2026-11-03T11:55:30Z" }, now), 6);
  assert.equal(minutesToAutoConfirm({ at: "2026-11-03T11:00:00Z" }, now), 0);
  assert.equal(minutesToAutoConfirm({}, now), null);
});
