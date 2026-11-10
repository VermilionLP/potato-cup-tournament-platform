import assert from "node:assert/strict";
import { test } from "node:test";
import { eventGuide, formatText } from "../src/lib/event-guide.js";

const base = { id: "e1", status: "registration", format: "single_elim", game_mode: "rb", vehicle_pool: "standard", player_capacity: 32 };
const ids = (g) => g.steps.map((s) => s.id);
const now = (g) => g.steps.find((s) => s.now)?.id ?? null;

test("steps follow check-in and Ban / Pick", () => {
  assert.deepEqual(ids(eventGuide(base)), ["profile", "register", "discord", "start", "play", "next"]);
  const g = eventGuide({ ...base, checkin_enabled: true }, { banpickEnabled: true, rules: { bansPerPlayer: 1 } });
  assert.deepEqual(ids(g), ["profile", "register", "discord", "checkin", "start", "banpick", "play", "next"]);
  assert.ok(g.banpick.some((p) => p.includes("各禁 1 个大组")));
  assert.equal(eventGuide(base).banpick, null);
});

test("the current step follows the event", () => {
  assert.equal(now(eventGuide(base)), "register");
  assert.equal(now(eventGuide({ ...base, status: "voting" })), "profile");
  assert.equal(now(eventGuide({ ...base, checkin_enabled: true, checkin: { open: true } })), "checkin");
  assert.equal(now(eventGuide({ ...base, status: "in_progress" })), "play");
  const done = eventGuide({ ...base, status: "completed" });
  assert.equal(now(done), null);
  assert.equal(done.finished, true);
});

test("format points per format", () => {
  assert.equal(eventGuide(base).format.title, "单败淘汰");
  const de = eventGuide({ ...base, format: "double_elim", grand_final_reset: true }).format;
  assert.equal(de.title, "双败淘汰");
  assert.ok(de.points.some((p) => p.startsWith("总决赛重置")));
  assert.ok(eventGuide({ ...base, format: "double_elim", grand_final_reset: false }).format.points.some((p) => p.startsWith("总决赛只打一场")));
  const sw = eventGuide({ ...base, format: "swiss", swiss_rounds: 5 }).format;
  assert.ok(sw.points[0].includes("5 轮"));
  const two = eventGuide({ ...base, format: "swiss", playoff_format: "single_elim", swiss_group_size: 8, advance_per_group: 2 }).format;
  assert.equal(two.title, "小组赛 + 淘汰赛");
  assert.ok(two.points[0].includes("每组 8 人") && two.points[0].includes("前 2 名"));
  assert.ok(eventGuide({ ...base, loser_advances: 1 }).format.points[0].includes("特殊玩法"));
});

test("notes, facts and ladder limit", () => {
  const g = eventGuide({ ...base, description: "  BO3  ", ladder_max_mmr: 1500 });
  assert.equal(g.notes, "BO3");
  assert.ok(g.steps[1].lines.some((l) => l.includes("天梯分 ≤ 1500")));
  assert.equal(new Map(g.facts).get("人数上限"), "32 人");
  assert.equal(eventGuide(null), null);
  assert.ok(formatText({ format: "double_elim" }).includes("双败"));
});

test("the play step points to the round headers once a best-of is set", () => {
  const play = (g) => g.steps.find((s) => s.id === "play").lines;
  assert.ok(!play(eventGuide(base)).some((l) => l.includes("BO3")));
  assert.ok(play(eventGuide({ ...base, round_best_of: { "main:1": 3 } })).some((l) => l.includes("BO3")));
});
