import assert from "node:assert/strict";
import { test } from "node:test";
import { describeEntry, groupByDay, roundKeyLabel } from "../src/lib/admin-log.js";
import { translate } from "../src/lib/i18n/translate.js";

const match = { player1: "Alice", player2: "Bob", before: null };

test("rows in words", () => {
  assert.equal(describeEntry({ action: "match.result", detail: { score1: 2, score2: 1, match } }), "录入比分 Alice 2:1 Bob");
  assert.equal(
    describeEntry({ action: "match.score", detail: { score1: 0, score2: 2, match: { ...match, before: { score1: 2, score2: 0 } } } }),
    "更正比分 Alice 0:2 Bob（原 2:0）",
  );
  assert.equal(describeEntry({ action: "match.walkover", detail: { winner_id: "Bob", match } }), "Alice vs Bob：判 Bob 胜（弃权）");
  assert.equal(describeEntry({ action: "event.settings", detail: { name: "Weekly #42" } }), "改名为「Weekly #42」");
  assert.equal(describeEntry({ action: "event.settings", detail: { format: "swiss", swiss_rounds: 5, checkin_enabled: true } }), "修改设置：赛制、签到");
  assert.equal(describeEntry({ action: "event.status", detail: { status: "registration" } }), "改为「报名中」");
  assert.equal(describeEntry({ action: "event.best_of", detail: { key: "main:2", best_of: 3 } }), "半决赛设为 BO3");
  assert.equal(describeEntry({ action: "player.change_id", detail: { target: "old", newId: "new" } }), "把选手 old 改名为 new");
  assert.equal(describeEntry({ action: "something.new", detail: {} }), "something.new");
});

test("round keys in words", () => {
  assert.equal(roundKeyLabel("main:1"), "决赛");
  assert.equal(roundKeyLabel("main:0"), "三四名决赛");
  assert.equal(roundKeyLabel("main:4"), "倒数第 4 轮");
  assert.equal(roundKeyLabel("wb:1"), "胜者组决赛");
  assert.equal(roundKeyLabel("lb:3"), "败者组倒数第 3 轮");
  assert.equal(roundKeyLabel("sw:2"), "瑞士轮第 2 轮");
  assert.equal(roundKeyLabel("gf:1"), "总决赛");
});

test("rows translate to English", () => {
  assert.equal(translate("录入比分 Alice 2:1 Bob"), "Entered the score: Alice 2:1 Bob");
  assert.equal(translate("Alice vs Bob：判 Bob 胜（弃权）"), "Alice vs Bob: walkover win for Bob");
  assert.equal(translate("半决赛设为 BO3"), "Semifinals set to BO3");
  assert.match(translate("改为「报名中」"), /^Set the stage to "/);
});

test("grouped by day, newest first", () => {
  const rows = [{ id: 3, at: "2026-11-11T10:00Z" }, { id: 2, at: "2026-11-11T09:00Z" }, { id: 1, at: "2026-11-10T09:00Z" }];
  assert.deepEqual(groupByDay(rows).map((g) => [g.day, g.entries.length]), [["2026-11-11", 2], ["2026-11-10", 1]]);
});
