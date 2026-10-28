import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, createTranslator, translate } from "../src/lib/i18n/translate.js";
import EN from "../src/lib/i18n/en.js";

test("exact text and surrounding whitespace", () => {
  assert.equal(translate("赛事大厅"), "Events");
  assert.equal(translate("  选手列表\n "), "  Players\n ");
  assert.equal(translate("Potato Cup"), "Potato Cup", "non-Chinese text untouched");
  assert.equal(translate("吃荔枝的狐狸"), "吃荔枝的狐狸", "unknown Chinese (names) untouched");
});

test("patterns with values, spacing variants and nested labels", () => {
  assert.equal(translate("第 3 轮"), "Round 3");
  assert.equal(translate("第3轮"), "Round 3");
  assert.equal(translate("共 499 名选手（近一年活跃 120 名）· 管理全局选手档案与关联信息"),
    "499 players (120 active in the last year) · manage global player profiles and links");
  // A captured label is translated too.
  assert.equal(translate("已判定游戏获胜者为 Horsewhite，胜者晋级下一轮"), "Winner: Horsewhite, the winner moves to the next round");
  assert.equal(translate("双败小组 → 单败淘汰"), "Double elim groups → Single elimination");
  assert.equal(translate("钻石 II"), "Diamond II");
  // Server messages inside a toast prefix.
  assert.equal(translate("操作失败: 小组赛还没有全部打完"), "Failed: Not all groups are finished yet");
  // Labels ending in a colon; clock times are not labels.
  assert.equal(translate("• 赛制结构:"), "• Structure:");
  assert.equal(translate("北京时间 2026/10/25 周日 10:00"), "Beijing time 2026/10/25 Sun 10:00");
  // {0:n} only takes a number, so "加载天梯…" is not read as "<n> 天 <clock>".
  assert.equal(translate("3 天 12:30:00"), "3 d 12:30:00");
  assert.equal(translate("加载天梯数据失败:"), "Couldn't load the ladder:");
  // Places as English ordinals.
  assert.equal(translate("第 1 名"), "1st");
  assert.equal(translate("第 22 名"), "22nd");
  assert.equal(translate("第 11 名"), "11th");
  assert.equal(translate("第 17-22 名"), "17th–22nd");
  // The more specific of two equally long patterns wins.
  assert.equal(translate("6 天后"), "In 6 days");
  assert.equal(translate("6 天前完赛"), "Finished 6 days ago");
});

test("separator-joined labels fall back to translating the parts", () => {
  assert.equal(translate("RB 历史模式 · 双败淘汰"), "RB Realistic · Double elimination".replace("Realistic", translate("历史模式")));
});

test("dictionary is well formed", () => {
  const { exact, patterns } = compile(EN);
  assert.ok(exact.size > 500 && patterns.length > 150);
  for (const [zh, en] of Object.entries(EN)) {
    assert.deepEqual((zh.replace(/:(?:n|ord)\}/g, '}').match(/\{\d+\}/g) || []).sort(), (en.replace(/:ord\}/g, '}').match(/\{\d+\}/g) || []).sort(), zh);
    assert.ok(!/[一-鿿]/.test(en), `English still has Chinese: ${en}`);
  }
  const t = createTranslator({ "{0} 人": "{0} players" });
  assert.equal(t("16 人"), "16 players");
});

test("text put together at runtime", () => {
  assert.equal(translate("每人禁 1 组 · 大组可移出 2 次 · 载具可不限次移出"), "1 ban(s) per player · Groups can be removed 2 times · Vehicles can be removed any number of times");
  assert.equal(translate("不禁用 · 大组不可移出 · 抽到大组即结束"), "No bans · Groups can't be removed · Ends once a group is drawn");
  assert.equal(translate("移出该组（剩 2 次）"), "Remove group (2 left)");
  assert.equal(translate("该组载具已全部移出，请返回大组重新抽取。"), "All vehicles of this group were removed; go back and draw another group.");
  assert.equal(translate("关闭比赛提醒失败: Network error"), "Couldn't turn off match reminders: Network error");
  assert.equal(translate("2026 赛季周赛 · 冠军直邀"), "2026 season, weekly · Champion invited");
  assert.equal(translate("2026 赛季 · 当前"), "2026 season · current");
  assert.equal(translate("新建赛事默认计入当前赛季（现在是 2026）。"), "New events count towards the current season by default (now 2026).");
  assert.equal(translate("才能添加自定义投票提案。"), "to add custom votes.");
  assert.equal(translate("每组人数必须在 2 至 64 之间，留空表示不分组"), "Group size must be between 2 and 64; leave empty for no groups");
  assert.equal(translate("12 人的双败对阵用了 Bracket/8U4L2DSL1D（带轮空位），请在 Liquipedia 上确认模板。"),
    "The 12-player double-elimination bracket uses Bracket/8U4L2DSL1D (with bye slots); check the template on Liquipedia.");
  assert.equal(translate("Group A 的双败小组对阵没有现成的 Liquipedia 模板对照，请确认模板名。"),
    "Group A: no known Liquipedia template for this double-elimination group; check the template name.");
  assert.equal(translate("载具池：自动（AB 螺旋桨）"), "Pool: automatic (AB Prop)");
  assert.equal(translate("8 个大组 · 30 架 · 每人禁 1 组 · 大组可不限次移出 · 载具可不限次移出"),
    "8 groups · 30 vehicles · 1 ban(s) per player · Groups can be removed any number of times · Vehicles can be removed any number of times");
});
