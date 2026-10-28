import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventBody, createSteps, eventIdFromName, groupPreview, newEventForm, stepError } from "../src/lib/create-event.js";
import { actionLabel, countdownLabel, displayCapacity, relativeDay, statusLabel, statusStyle } from "../src/lib/lobby.js";

test("relativeDay counts calendar days both ways", () => {
  const now = new Date(2026, 9, 28, 15, 0);
  assert.equal(relativeDay(new Date(2026, 9, 28, 1, 0), now), "今天");
  assert.equal(relativeDay(new Date(2026, 9, 29, 23, 0), now), "明天");
  assert.equal(relativeDay(new Date(2026, 9, 27), now), "昨天");
  assert.equal(relativeDay(new Date(2026, 10, 2), now), "5 天后");
  assert.equal(relativeDay(new Date(2026, 9, 18), now), "10 天前");
  assert.equal(relativeDay(null, now), "未知时间");
});

test("countdownLabel and capacity labels", () => {
  const now = Date.UTC(2026, 9, 28, 12, 0); // 20:00 Beijing time
  assert.equal(countdownLabel({ scheduled_time: "2026-10-28T20:30" }, now), "30 分钟后");
  assert.equal(countdownLabel({ scheduled_time: "2026-10-28T19:00" }, now), "已开赛");
  assert.equal(countdownLabel({}, now), "");
  assert.equal(displayCapacity({ player_count: 9, player_capacity: 128 }), 16);
  assert.equal(displayCapacity({ player_count: 9, player_capacity: 12 }), 12);
  assert.equal(actionLabel({ status: "voting" }), "去投票");
  assert.equal(statusLabel("in_progress"), "比赛进行中");
  assert.equal(statusLabel("odd"), "odd");
  assert.match(statusStyle("odd"), /zinc/);
});

test("the wizard has two extra pages for two-stage events", () => {
  const form = newEventForm("2026");
  assert.deepEqual(createSteps(form).map((s) => s.id), ["basics", "format", "extras"]);
  form.format = "two_stage";
  assert.deepEqual(createSteps(form).map((s) => s.id), ["basics", "format", "group", "playoff", "extras"]);
  assert.equal(form.pointsSeason, "2026");
});

test("step checks", () => {
  const form = newEventForm();
  assert.equal(stepError(form, "basics"), "请输入赛事名称");
  form.name = "土豆杯";
  assert.match(stepError(form, "basics"), /英文或数字/);
  form.name = "Potato Cup #40";
  assert.equal(stepError(form, "basics"), "");
  assert.equal(eventIdFromName(form.name), "potatocup40");
  form.format = "swiss";
  form.swissRoundsMode = "manual";
  form.swissRounds = 99;
  assert.match(stepError(form, "format"), /瑞士轮轮数/);
  form.format = "two_stage";
  form.groupFormat = "single_elim";
  form.groupSize = "";
  assert.equal(stepError(form, "group"), "淘汰制小组需要设置每组人数");
  form.groupSize = 4;
  form.advancePerGroup = 5;
  assert.equal(stepError(form, "group"), "每组晋级人数不能多于每组人数");
});

test("groupPreview counts groups, qualifiers and byes", () => {
  const form = { ...newEventForm(), format: "two_stage", capacity: 30, groupSize: 4, advancePerGroup: 2 };
  assert.deepEqual(groupPreview(form), { players: 30, groups: 8, smallest: 3, largest: 4, qualifiers: 16, byes: 0 });
  assert.equal(groupPreview({ ...form, format: "swiss" }), null);
});

test("createEventBody: single stage and two-stage requests", () => {
  const single = createEventBody({ ...newEventForm("2026"), name: "Weekly 40", format: "double_elim", pointsEnabled: false });
  assert.equal(single.id, "weekly40");
  assert.equal(single.body.format, "double_elim");
  assert.equal(single.body.grand_final_reset, true);
  assert.equal(single.body.playoff_format, null);
  assert.equal(single.body.points_table, null);
  assert.equal(single.body.swiss_rounds, null);

  const two = createEventBody({
    ...newEventForm("2026"),
    name: "Monthly",
    format: "two_stage",
    groupFormat: "swiss",
    swissRoundsMode: "manual",
    swissRounds: 4,
    playoffFormat: "single_elim",
    loserAdvances: true,
  });
  assert.equal(two.body.format, "swiss");
  assert.equal(two.body.playoff_format, "single_elim");
  assert.equal(two.body.swiss_rounds, 4);
  assert.equal(two.body.swiss_group_size, 4);
  assert.equal(two.body.advance_per_group, 2);
  assert.equal(two.body.loser_advances, 0);
  assert.equal(two.body.grand_final_reset, false);
  assert.equal(two.body.points_season, "2026");

  assert.match(createEventBody({ ...newEventForm(), name: "x", format: "two_stage", groupSize: 1 }).error, /留空表示不分组/);
});
