import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventBody, createSteps, eventIdFromName, firstProblem, groupPreview, newEventForm, stepError, stepSummary } from "../src/lib/create-event.js";
import { actionLabel, countdownLabel, displayCapacity, relativeDay, statusLabel, statusStyle, statusTone } from "../src/lib/lobby.js";

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
  // Unknown statuses get the neutral tag; live events the red one.
  assert.equal(statusTone("odd"), "neutral");
  assert.equal(statusTone("in_progress"), "live");
  assert.match(statusStyle("odd"), /bg-secondary/);
});

test("the wizard has two extra pages for two-stage events", () => {
  const form = newEventForm("2026");
  assert.deepEqual(createSteps(form).map((s) => s.id), ["basics", "format", "rules", "points"]);
  form.format = "two_stage";
  assert.deepEqual(createSteps(form).map((s) => s.id), ["basics", "format", "group", "playoff", "rules", "points"]);
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

test("wizard step summaries and the first problem", () => {
  const form = newEventForm("2026");
  assert.deepEqual(firstProblem(form), { step: "basics", error: "请输入赛事名称" });
  form.name = "Potato Cup Weekly #41";
  assert.equal(firstProblem(form), null);
  assert.equal(stepSummary(form, "basics"), "Potato Cup Weekly #41 · 128 人");
  assert.equal(stepSummary(form, "format"), "单败淘汰");
  assert.equal(stepSummary(form, "rules"), "Ban / Pick");
  assert.match(stepSummary(form, "points"), /^2026 周赛/);
  form.checkinEnabled = true;
  form.ladderLimit = "gold";
  assert.equal(stepSummary(form, "rules"), "Ban / Pick · 签到 · 黄金及以下");
  form.ladderLimit = "mmr";
  form.ladderMaxMmr = 5;
  assert.equal(firstProblem(form).step, "rules");
  form.ladderLimit = "";
  form.pointsSeason = "x";
  assert.equal(firstProblem(form).step, "points");
  form.pointsEnabled = false;
  assert.equal(stepSummary(form, "points"), "不计入积分榜");
  form.format = "two_stage";
  assert.equal(stepSummary(form, "group"), "瑞士轮 · 每组 4 人 · 前 2 晋级");
});

test("featured event: being played, else the next sign-up, else voting", async () => {
  const { featuredEvent } = await import("../src/lib/lobby.js");
  const reg = (id, time) => ({ id, status: "registration", scheduled_time: time });
  assert.equal(featuredEvent([]), null);
  assert.equal(featuredEvent([{ id: "v", status: "voting" }, reg("late", "2026-12-01 20:00"), reg("soon", "2026-11-10 20:00"), reg("none", null)]).id, "soon");
  assert.equal(featuredEvent([reg("a", "2026-11-10 20:00"), { id: "live", status: "in_progress" }]).id, "live");
  assert.equal(featuredEvent([{ id: "v", status: "voting" }, { id: "c", status: "completed" }]).id, "v");
});

test("the visitor's own events come first in the lobby", async () => {
  const { featuredEvent } = await import("../src/lib/lobby.js");
  const list = [
    { id: "live", status: "in_progress" },
    { id: "mine", status: "registration", scheduled_time: "2026-11-20T20:00" },
    { id: "soon", status: "registration", scheduled_time: "2026-11-14T20:00" },
  ];
  assert.equal(featuredEvent(list).id, "live");
  assert.equal(featuredEvent(list, new Set(["mine"])).id, "mine");
  assert.equal(featuredEvent(list, new Set(["gone"])).id, "live");
});
