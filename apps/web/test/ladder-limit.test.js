import { test } from "node:test";
import assert from "node:assert/strict";
import { ladderLimitLabel, limitChoice, limitFields, limitProblem } from "../src/lib/ladder-limit.js";
import { shareMessage } from "../src/lib/discord-share.js";

test("ladder limit form helpers", () => {
  assert.equal(ladderLimitLabel({}), "");
  assert.equal(ladderLimitLabel({ ladder_max_mmr: 3300 }), "天梯分 ≤ 3300");
  assert.equal(ladderLimitLabel({ ladder_max_tier: "gold" }), "黄金及以下");
  assert.equal(limitChoice({ ladder_max_mmr: 3300 }), "mmr");
  assert.equal(limitChoice({ ladder_max_tier: "diamond" }), "diamond");
  assert.equal(limitChoice({ ladder_max_mmr: null, ladder_max_tier: null }), "");
  assert.deepEqual(limitFields("mmr", "3200"), { ladder_max_mmr: 3200, ladder_max_tier: null });
  assert.deepEqual(limitFields("gold", 3200), { ladder_max_mmr: null, ladder_max_tier: "gold" });
  assert.deepEqual(limitFields("", 3200), { ladder_max_mmr: null, ladder_max_tier: null });
  assert.equal(limitProblem("gold", "x"), "");
  assert.equal(limitProblem("mmr", 3300), "");
  assert.ok(limitProblem("mmr", 99));
});

test("announcements list the ladder limit while signing up", () => {
  const t = { name: "W", status: "registration", game_mode: "rb", vehicle_pool: "prop", format: "single_elim", ladder_max_tier: "gold" };
  assert.match(shareMessage(t), /🎯 报名限制：黄金及以下/);
  assert.match(shareMessage({ ...t, ladder_max_tier: null, ladder_max_mmr: 3300 }, { lang: "en" }), /Sign-up limit: MMR ≤ 3300/);
  assert.doesNotMatch(shareMessage({ ...t, status: "in_progress" }), /报名限制/);
});
