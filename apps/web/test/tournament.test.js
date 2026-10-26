import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRACKET_FORMATS,
  isValidSwissRounds,
  startBlockedMessage,
  suggestedSwissRounds,
  advancementLabel,
  formatLabel,
  gameModeInfo,
  gameModeLabel,
  canCorrectResult,
  minPlayersForFormat,
} from "../src/lib/tournament.js";

test("game modes are the three WarThunder battle modes", () => {
  assert.deepEqual(
    ["ab", "rb", "sb"].map((id) => gameModeInfo(id).code),
    ["AB", "RB", "SB"],
  );
  assert.equal(gameModeLabel("sb"), "SB 全真模式");
});

test("unknown game modes fall back to realistic battles", () => {
  assert.equal(gameModeInfo(undefined).id, "rb");
  assert.equal(gameModeLabel("arcade"), "RB 历史模式");
});

test("bracket formats have readable labels", () => {
  assert.equal(formatLabel("single_elim"), "单败淘汰");
  assert.equal(formatLabel("double_elim"), "双败淘汰");
  assert.equal(formatLabel("swiss"), "瑞士轮");
  assert.equal(formatLabel(null), "单败淘汰");
});

test("advancement label follows loser_advances", () => {
  assert.equal(advancementLabel(0), "胜者晋级");
  assert.equal(advancementLabel(false), "胜者晋级");
  assert.equal(advancementLabel(1), "败者晋级");
  assert.equal(advancementLabel(true), "败者晋级");
});

test("start button thresholds match the server rule", () => {
  assert.equal(minPlayersForFormat("single_elim"), 2);
  assert.equal(minPlayersForFormat("double_elim"), 4);
  assert.equal(minPlayersForFormat(undefined), 2);
});

test("only finished matches between two players can be corrected", () => {
  const base = { player1_id: "a", player2_id: "b" };
  assert.equal(canCorrectResult({ ...base, status: "completed" }), true);
  assert.equal(canCorrectResult({ ...base, status: "walkover" }), true);
  assert.equal(canCorrectResult({ ...base, status: "pending" }), false);
  assert.equal(canCorrectResult({ player1_id: "a", player2_id: null, status: "completed" }), false);
  assert.equal(canCorrectResult(null), false);
});

test("swiss is selectable and its start rules match the server", () => {
  assert.equal(BRACKET_FORMATS.find((f) => f.id === "swiss").available, true);
  assert.equal(startBlockedMessage("single_elim", 1), "至少 2 人才能开赛（当前 1 人）");
  assert.equal(startBlockedMessage("double_elim", 4), null);
  assert.equal(startBlockedMessage("swiss", 8, null), "请先设置瑞士轮轮数");
  assert.equal(startBlockedMessage("swiss", 3, 3), "3 轮瑞士轮至少需要 4 人（当前 3 人）");
  assert.equal(startBlockedMessage("swiss", 8, 3), null);
  assert.equal(suggestedSwissRounds(16), 4);
  assert.equal(isValidSwissRounds(0), false);
  assert.equal(isValidSwissRounds(15), true);
});
