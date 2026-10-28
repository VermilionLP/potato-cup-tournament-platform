import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sourceFiles, uiStrings } from "./helpers/ui-strings.js";
import { translate } from "../src/lib/i18n/translate.js";

// Every Chinese UI string in the web app and the API messages it shows has
// an English translation. Needs svelte/compiler (installed with the web
// app's dependencies); skipped without it.

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

// Text that stays Chinese, or fragments put together at runtime whose full
// sentences are in the dictionary (checked in i18n.test.js). Runtime values
// show as "1" here.
const ALLOWED = new Set([
  "1可不限次移出",
  "1不可移出",
  "1可移出 1 次",
  "移出该组1",
  "移出该载具1",
  "该组载具已全部移出，1。",
  "1比赛提醒失败: 1",
  "1 赛季11",
  "才能1。",
  "赛制、对阵、比分和积分来自赛事本身；奖金、解说、直播等在「导出设置」里按赛事填写。1",
  "每组人数必须在 2 至 64 之间1",
  "，留空表示不分组",
  "切换到中文",
  "中",
  "1 赛季1",
  "（现在是 1）",
  "（未设置时按当年年份）",
  "新建赛事默认计入当前赛季1。",
  "每个模板属于一种比赛类型，可以限定游戏模式，并带有自己的 Ban / Pick 规则。比赛默认自动使用同类型里最匹配游戏模式的模板（按排序），管理员也可以在赛事页手动指定。1",
  "隐居寒天",
  "1 人的1对阵用了 1（带轮空位），请在 Liquipedia 上确认模板。",
  "Group 1 的1小组对阵没有现成的 Liquipedia 模板对照，请确认模板名。"
]);

let parse = null;
try {
  ({ parse } = await import("svelte/compiler"));
} catch {
  // svelte not installed (offline sandbox): skip
}

test("all Chinese UI text has English", { skip: !parse && "svelte/compiler not installed" }, () => {
  const files = [
    ...sourceFiles(join(root, "web/src"), [".svelte", ".js"]).filter((f) => !f.includes("/i18n/") && !f.includes("/components/ui/")),
    ...sourceFiles(join(root, "api/routes"), [".js"]),
    ...sourceFiles(join(root, "api/lib"), [".js"]).filter((f) => !/liquipedia\/(countries|de-templates)/.test(f)),
  ];
  const missing = [...uiStrings(parse, files)]
    .filter(([text]) => /[一-鿿]/.test(translate(text)) && !ALLOWED.has(text))
    .map(([text, file]) => `${text}  (${file.slice(root.length + 1)})`);
  assert.deepEqual(missing, [], "add these to src/lib/i18n/en.js");
});
