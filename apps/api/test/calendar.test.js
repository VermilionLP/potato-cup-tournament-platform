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

test("the feeds ring before the start; a player's feed adds 10 minutes and check-in", async () => {
  const { buildCalendarFeed } = await import("../lib/calendar.js");
  const all = buildCalendarFeed([{ id: "e1", name: "E1", scheduled_time: "2026-11-20 20:00" }], new Date("2026-11-10T00:00:00Z"), { origin: "https://cup.example" });
  assert.equal((all.match(/TRIGGER:-PT60M/g) || []).length, 1);
  assert.ok(!all.includes("TRIGGER:-PT10M"));
  assert.ok(all.includes("URL:https://cup.example/tournament/e1"));
  assert.ok(all.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H"));
  const mine = buildCalendarFeed([
    { id: "e1", name: "E1", scheduled_time: "2026-11-20 20:00", status: "registration", checkin_enabled: true },
    { id: "e2", name: "E2", scheduled_time: "2026-11-21 20:00", status: "registration", checkin_enabled: false },
  ], new Date("2026-11-10T00:00:00Z"), { player: "Alice" });
  assert.equal((mine.match(/TRIGGER:-PT10M/g) || []).length, 2);
  assert.equal((mine.match(/TRIGGER:-PT30M/g) || []).length, 1);
  assert.ok(mine.includes("X-WR-CALNAME:Potato Cup · Alice"));
  assert.ok(mine.endsWith("\r\n"));
});

test("long lines are folded at 75 octets without splitting characters", async () => {
  const { foldLine } = await import("../lib/calendar.js");
  const line = `SUMMARY:${"土豆杯".repeat(40)}`;
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) assert.ok(Buffer.byteLength(part) <= 75, part);
  assert.equal(folded.replace(/\r\n /g, ""), line);
  assert.equal(foldLine("SHORT"), "SHORT");
});
