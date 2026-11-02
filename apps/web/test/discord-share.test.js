import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLine, poolLines, scheduledUnix, shareMessage, splitForDiscord, stamp } from "../src/lib/discord-share.js";

const t = {
  id: "potatocupweekly41", name: "Potato Cup Weekly #41", status: "registration", scheduled_time: "2026-11-08T20:00",
  game_mode: "rb", vehicle_pool: "prop", format: "swiss", playoff_format: "double_elim", swiss_group_size: 4, advance_per_group: 2,
  swiss_rounds_auto: true, grand_final_reset: true, player_capacity: 32, players: [{ id: "a" }, { id: "b" }],
  checkin: { enabled: true }, points_table: [{ from: 1, to: 1, points: 10 }], points_season: "2026", points_kind: "weekly", banpick_enabled: true,
};
const template = {
  name: "螺旋桨 RB 4.0",
  rules: { bansPerPlayer: 1, groupRerolls: 2, vehicleRerolls: null, drawVehicle: true },
  vehicles: [
    { group: "美国", name: "P-47D", br: 4 }, { group: "美国", name: "P-51D", br: 4.3 }, { group: "美国", name: "P-51D", br: 4.3 },
    { group: "德国", name: "Fw 190 A-5", br: 4 },
  ],
};

test("Beijing time to Discord timestamps", () => {
  assert.equal(scheduledUnix("2026-11-08T20:00"), Date.parse("2026-11-08T12:00:00Z") / 1000);
  assert.equal(scheduledUnix(""), null);
  assert.equal(stamp(1794139200, "R"), "<t:1794139200:R>");
  assert.equal(stamp(null), "");
});

test("format line and vehicle pool", () => {
  assert.equal(formatLine(t), "瑞士轮小组 → 双败淘汰 · 每组 4 人，前 2 名晋级 · 瑞士轮单循环 · 总决赛可重置");
  assert.deepEqual(poolLines(template, "summary"), [
    "🚗 载具池：**螺旋桨 RB 4.0** · Ban / Pick：每人禁 1 组 · 大组可移出 2 次 · 载具可不限次移出",
    "- **美国**：2 辆，BR 4.0–4.3",
    "- **德国**：1 辆，BR 4.0",
  ]);
  assert.deepEqual(poolLines(template, "full").slice(1), ["- **美国**：P-47D、P-51D", "- **德国**：Fw 190 A-5"]);
  assert.deepEqual(poolLines(template, "none"), []);
  assert.deepEqual(poolLines(null), [], "no template, no lines");
});

test("the announcement", () => {
  const unix = scheduledUnix(t.scheduled_time);
  const text = shareMessage(t, { siteUrl: "https://cup.example/", template });
  assert.match(text, /^## 🥔 Potato Cup Weekly #41\n/);
  assert.ok(text.includes(`🗓️ 比赛时间：<t:${unix}:F>（<t:${unix}:R>）`));
  assert.ok(text.includes("🎮 RB 历史模式 · 螺旋桨"));
  assert.ok(text.includes("👥 报名：2 / 32 人"));
  assert.ok(text.includes(`✅ 需要签到：<t:${unix - 1800}:t> 开放（开赛前 30 分钟）`));
  assert.ok(text.includes("📊 计入 2026 赛季积分榜（周赛）"));
  assert.ok(text.endsWith("🔗 报名：https://cup.example/tournament/potatocupweekly41"));
  const voting = shareMessage({ ...t, status: "voting", scheduled_time: "" }, {});
  assert.ok(voting.includes("投票中"));
});

test("results and splitting long posts", () => {
  const text = shareMessage({ ...t, status: "completed" }, { kind: "results", podium: [["a"], ["b"], ["c", "d"]], siteUrl: "https://x" });
  assert.match(text, /🥇 \*\*a\*\*\n🥈 \*\*b\*\*\n🥉 \*\*c \/ d\*\*/);
  const long = Array.from({ length: 60 }, (_, i) => `line ${i} ${"x".repeat(50)}`).join("\n");
  const parts = splitForDiscord(long, 2000);
  assert.ok(parts.length === 2 && parts.every((p) => p.length <= 2000));
  assert.equal(parts.join("\n"), long, "nothing lost");
});

test("English posts use the site's dictionary for labels", () => {
  const text = shareMessage(t, { siteUrl: "https://cup.example", template, lang: "en" });
  const unix = scheduledUnix(t.scheduled_time);
  assert.ok(text.includes(`🗓️ Starts <t:${unix}:F> (<t:${unix}:R>)`));
  assert.ok(text.includes("🎮 RB Realistic · Prop"), text);
  assert.ok(text.includes("groups of 4, top 2 advance"));
  assert.ok(text.includes("- **美国**: 2 vehicles, BR 4.0–4.3"));
  assert.ok(text.includes("🔗 Sign up: https://cup.example/tournament/potatocupweekly41"));
  assert.doesNotMatch(text.replace(/\*\*[^*]+\*\*/g, ""), /[一-鿿]/, "no Chinese outside names");
});
