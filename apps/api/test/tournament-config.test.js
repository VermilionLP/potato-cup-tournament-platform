import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeGameMode,
  normalizeVehiclePool,
  resolveInitialStatus,
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
