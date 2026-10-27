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
    assert.deepEqual((zh.replace(/:n\}/g, '}').match(/\{\d+\}/g) || []).sort(), (en.match(/\{\d+\}/g) || []).sort(), zh);
    assert.ok(!/[一-鿿]/.test(en), `English still has Chinese: ${en}`);
  }
  const t = createTranslator({ "{0} 人": "{0} players" });
  assert.equal(t("16 人"), "16 players");
});
