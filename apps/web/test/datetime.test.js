import assert from "node:assert/strict";
import { test } from "node:test";
import { formatScheduled, isPastDay, monthGrid, parseLocal, shiftMonth, toValue } from "../src/lib/datetime.js";

test("parses and formats datetime-local values", () => {
  assert.deepEqual(parseLocal("2026-11-01T20:30"), { y: 2026, m: 11, d: 1, hh: 20, mm: 30 });
  assert.deepEqual(parseLocal("2026-11-01 08:05"), { y: 2026, m: 11, d: 1, hh: 8, mm: 5 });
  assert.equal(parseLocal("本周六晚8点"), null);
  assert.equal(toValue(2026, 11, 1, "20:30"), "2026-11-01T20:30");
  assert.equal(formatScheduled("2026-11-01T20:30"), "2026/11/01 周日 20:30");
  assert.equal(formatScheduled("本周六晚8点"), "本周六晚8点");
});

test("month grid starts on Monday and covers the whole month", () => {
  const weeks = monthGrid(2026, 11); // 1 Nov 2026 is a Sunday
  assert.equal(weeks[0].length, 7);
  assert.deepEqual(weeks[0][6], { y: 2026, m: 11, d: 1, inMonth: true, weekend: true });
  assert.equal(weeks[0][0].inMonth, false);
  const days = weeks.flat().filter((d) => d.inMonth).map((d) => d.d);
  assert.deepEqual(days, Array.from({ length: 30 }, (_, i) => i + 1));
  assert.ok(weeks.flat().slice(-7).some((d) => d.inMonth), "no trailing empty week");
});

test("month navigation and past days", () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { y: 2025, m: 12 });
  const now = new Date(2026, 9, 27, 2, 0);
  assert.equal(isPastDay({ y: 2026, m: 10, d: 26 }, now), true);
  assert.equal(isPastDay({ y: 2026, m: 10, d: 27 }, now), false);
});

test("stored Beijing times convert to the viewer's time zone", async () => {
  const { toInstant, formatInZone, zoneOffsetMinutes, offsetLabel } = await import("../src/lib/datetime.js");
  const t = toInstant("2026-11-01T20:30");
  assert.equal(t.toISOString(), "2026-11-01T12:30:00.000Z");
  assert.equal(formatInZone(t, "Asia/Shanghai"), "2026/11/01 周日 20:30");
  assert.equal(formatInZone(t, "Asia/Tokyo"), "2026/11/01 周日 21:30");
  assert.equal(formatInZone(t, "Europe/Moscow"), "2026/11/01 周日 15:30");
  // 1 Nov 2026 is after US daylight saving ends: New York is UTC-5.
  assert.equal(formatInZone(t, "America/New_York"), "2026/11/01 周日 07:30");
  assert.equal(formatInZone(toInstant("2026-11-01T02:00"), "Europe/London"), "2026/10/31 周六 18:00");
  assert.equal(zoneOffsetMinutes(t, "Asia/Tokyo"), 540);
  assert.equal(zoneOffsetMinutes(t, "Asia/Kolkata"), 330);
  assert.equal(offsetLabel(540), "UTC+9");
  assert.equal(offsetLabel(330), "UTC+5:30");
  assert.equal(offsetLabel(-300), "UTC-5");
  assert.equal(toInstant("本周六晚8点"), null);
});

test("countdown before and after the start", async () => {
  const { countdown } = await import("../src/lib/datetime.js");
  const start = new Date("2026-11-01T12:30:00Z");
  assert.deepEqual(countdown(start, new Date("2026-10-28T08:18:51Z")), { phase: "before", text: "4 天 04:11:09" });
  assert.deepEqual(countdown(start, new Date("2026-11-01T12:29:59Z")), { phase: "before", text: "00:00:01" });
  assert.deepEqual(countdown(start, new Date("2026-11-01T12:45:00Z")), { phase: "after", text: "已开赛 15 分钟" });
  assert.deepEqual(countdown(start, new Date("2026-11-01T14:35:00Z")), { phase: "after", text: "已开赛 2 小时 5 分" });
});
