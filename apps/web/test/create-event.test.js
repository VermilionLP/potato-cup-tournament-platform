import { test } from "node:test";
import assert from "node:assert/strict";
import { copyableEvents, createEventBody, formFromEvent, nextEventName, nextWeekTime } from "../src/lib/create-event.js";

test("the next name and the next week's time", () => {
  assert.equal(nextEventName("Potato Cup Weekly #40"), "Potato Cup Weekly #41");
  assert.equal(nextEventName("Weekly 09"), "Weekly 10");
  assert.equal(nextEventName("Potato Cup 2026 Fall Cup 3 Finals"), "Potato Cup 2026 Fall Cup 4 Finals");
  assert.equal(nextEventName("Spring Cup"), "");
  const now = new Date("2026-11-03T00:00:00Z"); // 08:00 in Beijing
  assert.equal(nextWeekTime("2026-11-01T20:00", now), "2026-11-08T20:00");
  assert.equal(nextWeekTime("2026-10-11T20:00", now), "2026-11-08T20:00", "skips past weeks");
  assert.equal(nextWeekTime("2026-11-03T09:00", now), "2026-11-10T09:00", "always at least a week later");
  assert.equal(nextWeekTime("", now), "");
});

test("a copied event keeps the set-up, not the invite", () => {
  const src = {
    id: "potatocupweekly40", name: "Potato Cup Weekly #40", player_capacity: 32, scheduled_time: "2026-11-01T20:00",
    game_mode: "ab", vehicle_pool: "prop", format: "swiss", playoff_format: "double_elim", swiss_group_size: 4,
    advance_per_group: 2, swiss_rounds: null, grand_final_reset: true, banpick_enabled: true,
    points_table: [{ from: 1, to: 1, points: 10 }], points_kind: "weekly", points_invite: true,
    checkin_enabled: true, tier: "C", event_kind: "weekly", vehicle_template: "tpl1",
  };
  const form = formFromEvent(src, "2026", new Date("2026-11-03T00:00:00Z"));
  assert.equal(form.name, "Potato Cup Weekly #41");
  assert.equal(form.format, "two_stage");
  assert.equal(form.groupFormat, "swiss");
  assert.equal(form.playoffFormat, "double_elim");
  assert.equal(form.pointsInvite, false);
  assert.equal(form.scheduledTime, "2026-11-08T20:00");
  const { body, error } = createEventBody(form);
  assert.equal(error, undefined);
  assert.equal(body.id, "potatocupweekly41");
  assert.equal(body.format, "swiss");
  assert.equal(body.playoff_format, "double_elim");
  assert.equal(body.checkin_enabled, true);
  assert.equal(body.tier, "C");
  assert.equal(body.event_kind, "weekly");
  assert.equal(body.vehicle_template, "tpl1");
  assert.equal(body.points_invite, false);
  assert.deepEqual(copyableEvents([{ id: "lp-x" }, { id: "a" }]).map((t) => t.id), ["a"]);
});
