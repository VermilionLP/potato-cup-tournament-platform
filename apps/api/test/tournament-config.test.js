import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeGameMode,
  normalizeVehiclePool,
  minPlayersForFormat,
  resolveInitialStatus,
  startBlockedReason,
} from "../lib/tournament-config.js";

test("a scheduled match time skips the voting phase", () => {
  assert.equal(resolveInitialStatus("2026-10-31T22:00"), "registration");
  assert.equal(resolveInitialStatus("  2026-10-31 22:00  "), "registration");
});

test("an empty match time keeps the voting phase", () => {
  for (const raw of [null, undefined, "", "   "]) {
    assert.equal(resolveInitialStatus(raw), "voting");
  }
});

test("game_mode falls back to realistic battles", () => {
  assert.equal(normalizeGameMode("ab"), "ab");
  assert.equal(normalizeGameMode("SB"), "sb");
  assert.equal(normalizeGameMode(" rb "), "rb");
  assert.equal(normalizeGameMode("arcade"), "rb");
  assert.equal(normalizeGameMode(null), "rb");
});

test("vehicle pools are slug-like and fall back to proleague", () => {
  assert.equal(normalizeVehiclePool("legacy-jet"), "legacy-jet");
  assert.equal(normalizeVehiclePool("ProLeague"), "proleague");
  assert.equal(normalizeVehiclePool("bad pool!"), "proleague");
  assert.equal(normalizeVehiclePool(""), "proleague");
  assert.equal(normalizeVehiclePool(undefined), "proleague");
});

test('single elimination needs two players, double elimination four', () => {
  assert.equal(minPlayersForFormat('single_elim'), 2);
  assert.equal(minPlayersForFormat('double_elim'), 4);
  assert.equal(minPlayersForFormat(undefined), 2);
});

test('starting with too few players is refused with the count', () => {
  assert.equal(startBlockedReason('single_elim', 0), '至少需要 2 名选手才能开赛（当前 0 人）');
  assert.equal(startBlockedReason('single_elim', 1), '至少需要 2 名选手才能开赛（当前 1 人）');
  assert.equal(startBlockedReason('double_elim', 3), '至少需要 4 名选手才能开赛（当前 3 人）');
  assert.equal(startBlockedReason('double_elim', null), '至少需要 4 名选手才能开赛（当前 0 人）');
});

test('starting with enough players is allowed', () => {
  assert.equal(startBlockedReason('single_elim', 2), null);
  assert.equal(startBlockedReason('double_elim', 4), null);
  assert.equal(startBlockedReason('double_elim', 16), null);
});
