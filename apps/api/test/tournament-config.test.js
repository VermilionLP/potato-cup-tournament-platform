import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeGameMode,
  normalizeVehiclePool,
  minPlayersForFormat,
  resolveInitialStatus,
  startBlockedReason,
  SUPPORTED_FORMATS,
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

test('swiss is a supported format that needs a round count to start', () => {
  assert.ok(SUPPORTED_FORMATS.includes('swiss'));
  assert.equal(minPlayersForFormat('swiss'), 2);
  assert.equal(startBlockedReason('swiss', 1, 3), '至少需要 2 名选手才能开赛（当前 1 人）');
  assert.equal(startBlockedReason('swiss', 8, null), null, 'automatic rounds');
  assert.equal(startBlockedReason('swiss', 3, 4), '瑞士轮 4 轮至少需要 5 名选手（当前 3 人）');
  assert.equal(startBlockedReason('swiss', 8, 3), null);
});

test('two-stage swiss uses the group-stage start rules', () => {
  const twoStage = { groupSize: 8, perGroup: 2, playoffFormat: 'single_elim' };
  assert.equal(startBlockedReason('swiss', 32, 3, twoStage), null);
  assert.equal(
    startBlockedReason('swiss', 9, 4, twoStage),
    '最小的组只有 4 人，最多只能打 3 轮瑞士轮（当前设置 4 轮）',
  );
  assert.equal(startBlockedReason('swiss', 1, 3, twoStage), '至少需要 2 名选手才能开赛（当前 1 人）');
  // Without a playoff format it is a single-stage event.
  assert.equal(startBlockedReason('swiss', 4, 4, { groupSize: 2, perGroup: 1, playoffFormat: null }),
    '瑞士轮 4 轮至少需要 5 名选手（当前 4 人）');
});

test('Top Jet: its own type, counted on the Legacy Jet points board', async () => {
  const { VEHICLE_POOLS, normalizeEventPool, pointsBoardOf } = await import('../lib/tournament-config.js');
  assert.deepEqual(VEHICLE_POOLS, ['prop', 'legacy-jet', 'top-jet', 'proleague']);
  assert.equal(normalizeEventPool('top-jet'), 'top-jet');
  assert.equal(pointsBoardOf('top-jet'), 'legacy-jet');
  assert.equal(pointsBoardOf('legacy-jet'), 'legacy-jet');
  assert.equal(pointsBoardOf('prop'), 'prop');
});
