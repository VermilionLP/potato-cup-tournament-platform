import assert from "node:assert/strict";
import { test } from "node:test";
import { getGradient, getModeCode, getModeName, modeColors, placeClass, placeText, POOL_COLORS } from "../src/lib/stats-view.js";
import { VEHICLE_POOLS } from "../src/lib/tournament.js";

test("statistics page helpers", () => {
  assert.equal(placeText({ from: 3, to: 3 }), "第 3 名");
  assert.equal(placeText({ from: 5, to: 8 }), "第 5-8 名");
  assert.equal(placeText(null), "");
  assert.match(placeClass({ from: 1, to: 1 }), /amber/);
  assert.match(placeClass({ from: 9, to: 12 }), /muted/);
  assert.equal(getModeCode("ab"), "AB");
  assert.equal(getModeCode(""), "—");
  assert.equal(getModeName("sb"), "SB 全真模式");
  assert.equal(getModeName(""), "暂无对局");
  assert.match(modeColors("x").dot, /zinc/);
  for (const pool of VEHICLE_POOLS) assert.ok(POOL_COLORS[pool.id], `colour for ${pool.id}`);
  assert.equal(getGradient("abc"), getGradient("abc"));
});
