import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advancementLabel,
  formatLabel,
  gameModeInfo,
  gameModeLabel,
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
