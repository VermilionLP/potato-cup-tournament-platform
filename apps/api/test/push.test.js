import assert from "node:assert/strict";
import { test } from "node:test";
import { reminderPayload, reminderWindow } from "../lib/push.js";

test("reminderWindow opens one hour before the Asia/Shanghai start", () => {
  const now = Date.parse("2026-10-25T11:30:00Z"); // 19:30 CST
  const window = reminderWindow("2026-10-25 (周日) 20:30", now);
  assert.ok(window);
  assert.equal(window.start, Date.parse("2026-10-25T12:30:00Z"));
  assert.equal(window.remindAt, Date.parse("2026-10-25T11:30:00Z"));
  assert.equal(window.due, true);
  assert.equal(reminderWindow("2026-10-25 (周日) 20:30", now - 3600000).due, false);
});

test("reminderPayload points at the tournament", () => {
  const payload = reminderPayload({
    id: "suck47",
    name: "SUCK#47",
    scheduled_time: "2026-10-25 (周日) 20:30",
  });
  assert.equal(payload.title, "Potato Cup 比赛提醒");
  assert.ok(payload.body.includes("20:30"));
  assert.equal(payload.url, "/tournament/suck47");
});
