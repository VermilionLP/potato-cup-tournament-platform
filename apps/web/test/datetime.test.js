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
