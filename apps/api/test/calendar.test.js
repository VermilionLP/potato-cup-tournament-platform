import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCalendarFeed, buildTournamentIcs, parseScheduledDateTime } from "../lib/calendar.js";

test("parseScheduledDateTime handles display and date-only forms", () => {
  assert.deepEqual(parseScheduledDateTime("2026-10-25 (周日) 20:30"), {
    year: 2026, month: 10, day: 25, hour: 20, minute: 30, hasTime: true,
  });
  assert.deepEqual(parseScheduledDateTime("2026-06-14"), {
    year: 2026, month: 6, day: 14, hour: 20, minute: 0, hasTime: false,
  });
  assert.equal(parseScheduledDateTime("待定"), null);
});

test("buildTournamentIcs emits a UTC event at Asia/Shanghai time", () => {
  const ics = buildTournamentIcs({
    id: "suck47",
    name: "SUCK#47",
    scheduledTime: "2026-10-22 (周四) 20:30",
    now: new Date("2026-10-23T00:00:00Z"),
  });
  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("DTSTART:20261022T123000Z"));
  assert.ok(ics.includes("DTEND:20261022T143000Z"));
  assert.ok(ics.includes("SUMMARY:SUCK#47"));
});

test("buildCalendarFeed includes every scheduled tournament", () => {
  const ics = buildCalendarFeed([
    { id: "suck47", name: "SUCK#47", scheduled_time: "2026-10-22 (周四) 20:30" },
    { id: "suck48", name: "SUCK#48", scheduled_time: "2026-10-25 (周日) 20:30" },
    { id: "tbd", name: "TBD", scheduled_time: "" },
  ], new Date("2026-10-23T00:00:00Z"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(ics.includes("SUMMARY:SUCK#47"));
  assert.ok(ics.includes("SUMMARY:SUCK#48"));
});
