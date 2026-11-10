import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarUrl, freshItems, itemText, webcalUrl } from "../src/lib/reminders.js";
import { translate } from "../src/lib/i18n/translate.js";

const NOW = Date.parse("2026-11-20T11:40:00Z");
const base = { tournament_id: "cup 1", tournament: "Cup", opponent: "Op" };

test("each reminder says what to do and links to the event", () => {
  const confirm = itemText({ ...base, kind: "confirm", key: "c", score: [1, 3], deadline: "2026-11-20T11:45:00Z" }, NOW);
  assert.equal(confirm.title, "请确认比分");
  assert.equal(confirm.body, "Cup：对手提交了 1 : 3，5 分钟内不处理将自动生效");
  assert.equal(confirm.url, "/tournament/cup%201");
  assert.equal(itemText({ ...base, kind: "confirm", score: [1, 3], deadline: "2026-11-20T11:00:00Z" }, NOW).body, "Cup：对手提交了 1 : 3");
  assert.equal(itemText({ ...base, kind: "ban" }).title, "轮到你禁用了");
  assert.equal(itemText({ ...base, kind: "ready" }).body, "Cup：你的对手是 Op");
  assert.equal(itemText({ ...base, kind: "soon", start: "2026-11-20T12:00:00Z" }).body, "Cup 将在 20:00 开始，请提前进入游戏");
});

test("reminder texts have English", () => {
  assert.equal(translate("Cup：对手提交了 1 : 3，5 分钟内不处理将自动生效"), "Cup: your opponent reported 1 : 3; it takes effect in 5 min unless you respond");
  assert.equal(translate("Cup：你的对手是 Op"), "Cup: your opponent is Op");
});

test("calendar links: the player's own feed, as webcal for calendar apps", () => {
  assert.equal(calendarUrl("https://cup.example", "A B"), "https://cup.example/api/calendar.ics?player=A%20B");
  assert.equal(calendarUrl("https://cup.example"), "https://cup.example/api/calendar.ics");
  assert.equal(webcalUrl("https://cup.example/api/calendar.ics"), "webcal://cup.example/api/calendar.ics");
  assert.equal(webcalUrl("http://1.2.3.4/api/calendar.ics"), "webcal://1.2.3.4/api/calendar.ics");
});

test("only reminders not seen before are new", () => {
  const items = [{ key: "a" }, { key: "b" }];
  assert.deepEqual(freshItems(items, new Set(["a"])), [{ key: "b" }]);
});
