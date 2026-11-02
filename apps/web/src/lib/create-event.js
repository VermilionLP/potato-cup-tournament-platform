// The "create event" wizard in the lobby: form defaults, steps, checks and
// the request body. Pure functions over a plain form object so they can be
// tested with node --test (the dialog keeps the form in $state).

import { MAX_SWISS_ROUNDS, MIN_SWISS_ROUNDS, groupBracketProblem, isValidSwissRounds } from "./tournament.js";
import { POINTS_PRESETS, cleanTable, copyTable, currentSeason, pointsTableProblem } from "./points.js";

/** A fresh form; `season` is the admins' current points season, if known. */
export function newEventForm(season = "") {
  return {
    name: "",
    capacity: 128,
    scheduledTime: "",
    gameMode: "rb",
    // Event type (螺旋桨 / 早期喷气 / 顶级喷气 / Pro League BVR); Ban / Pick picks its
    // vehicle pool template from it.
    eventPool: "proleague",
    // "two_stage" = group stage + playoff; the group stage is played as
    // groupFormat (Swiss, single or double elimination per group).
    format: "single_elim",
    loserAdvances: false,
    grandFinalReset: true,
    swissRounds: 3,
    // "auto" = full round robin (everyone meets everyone in their group once).
    swissRoundsMode: "auto",
    groupFormat: "swiss",
    playoffFormat: "single_elim",
    groupSize: 4,
    advancePerGroup: 2,
    banpickEnabled: true,
    // Potato Cup points (积分榜): on by default with the weekly table.
    pointsEnabled: true,
    pointsTable: copyTable(POINTS_PRESETS[0].table),
    pointsSeason: season || currentSeason(),
    pointsKind: "weekly",
    pointsInvite: false,
    // Check-in 30 minutes before the start (migration 034).
    checkinEnabled: false,
    // Copied from another event: its tier / kind and vehicle pool template.
    tier: "",
    eventKind: "",
    vehicleTemplate: "",
    copiedFrom: "",
  };
}

/** "Potato Cup Weekly #40" -> "Potato Cup Weekly #41"; "" when the name has no number. */
export function nextEventName(name) {
  const m = String(name || "").match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return "";
  const next = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return `${m[1]}${next}${m[3]}`;
}

const pad = (n) => String(n).padStart(2, "0");

/**
 * The same weekday and time, a week (or as many weeks as needed) later
 * than `scheduled` ("YYYY-MM-DDTHH:mm", Beijing time), and after `now`;
 * "" when there is no time to go by.
 */
export function nextWeekTime(scheduled, now = new Date()) {
  const m = String(scheduled || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return "";
  // Work in UTC on the Beijing wall-clock time; the offset never changes.
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const nowBeijing = now.getTime() + 8 * 3600 * 1000;
  do t += 7 * 86400 * 1000;
  while (t <= nowBeijing);
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * A form copied from an earlier event: everything but the players, with
 * the next number in the name and the next week's time. Points invites
 * are per event and stay off.
 */
export function formFromEvent(t, season = "", now = new Date()) {
  const form = newEventForm(season);
  const twoStage = Boolean(t.playoff_format);
  const pointsTable = Array.isArray(t.points_table) && t.points_table.length ? copyTable(t.points_table) : null;
  return {
    ...form,
    name: nextEventName(t.name),
    capacity: Number(t.player_capacity) || form.capacity,
    scheduledTime: nextWeekTime(t.scheduled_time, now),
    gameMode: t.game_mode || form.gameMode,
    eventPool: t.vehicle_pool || form.eventPool,
    format: twoStage ? "two_stage" : t.format || form.format,
    loserAdvances: Boolean(Number(t.loser_advances)),
    grandFinalReset: t.grand_final_reset !== false,
    swissRoundsMode: t.swiss_rounds ? "manual" : "auto",
    swissRounds: t.swiss_rounds || form.swissRounds,
    groupFormat: twoStage ? t.format : form.groupFormat,
    playoffFormat: twoStage ? t.playoff_format : form.playoffFormat,
    groupSize: twoStage ? (t.swiss_group_size ?? "") : form.groupSize,
    advancePerGroup: twoStage ? t.advance_per_group || form.advancePerGroup : form.advancePerGroup,
    banpickEnabled: t.banpick_enabled !== false,
    pointsEnabled: Boolean(pointsTable),
    pointsTable: pointsTable || form.pointsTable,
    pointsKind: t.points_kind || form.pointsKind,
    pointsInvite: false,
    checkinEnabled: Boolean(t.checkin_enabled),
    tier: t.tier || "",
    eventKind: t.event_kind || "",
    vehicleTemplate: t.vehicle_template || "",
    copiedFrom: t.id,
  };
}

/** Events worth copying: made on the site (not imported), newest first. */
export function copyableEvents(tournaments = [], limit = 15) {
  return tournaments.filter((t) => !String(t.id).startsWith("lp-")).slice(0, limit);
}

export const isTwoStage = (form) => form.format === "two_stage";
export const usesSwissRounds = (form) => form.format === "swiss" || (isTwoStage(form) && form.groupFormat === "swiss");

/** Group size the automatic Swiss round count is based on (single stage: everyone). */
export function autoRoundsBasis(form) {
  return isTwoStage(form) && Number(form.groupSize) >= 2 ? Number(form.groupSize) : null;
}

/** Event ID made from the name: lower-case letters and digits. */
export const eventIdFromName = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** Wizard steps: basics, format, one page per stage of a two-stage event, extras. */
export function createSteps(form) {
  return [
    { id: "basics", label: "基本信息" },
    { id: "format", label: "赛制" },
    ...(isTwoStage(form)
      ? [
          { id: "group", label: "第一阶段 · 小组赛" },
          { id: "playoff", label: "第二阶段 · 淘汰赛" },
        ]
      : []),
    { id: "extras", label: "载具与确认" },
  ];
}

const groupSizeValue = (form) => (form.groupSize === "" || form.groupSize === null ? null : Number(form.groupSize));

/** Live check of an elimination group set-up (the server checks again at start). */
export function groupProblem(form) {
  return isTwoStage(form) && form.groupFormat !== "swiss" && Number(form.groupSize) >= 2
    ? groupBracketProblem(form.groupFormat, Number(form.groupSize), Number(form.advancePerGroup))
    : null;
}

function groupSetupError(form, emptySizeHint = "") {
  const size = groupSizeValue(form);
  if (form.groupFormat !== "swiss" && size === null) return "淘汰制小组需要设置每组人数";
  if (size !== null && (!Number.isInteger(size) || size < 2 || size > 64)) return `每组人数必须在 2 至 64 之间${emptySizeHint}`;
  const k = Number(form.advancePerGroup);
  if (!Number.isInteger(k) || k < 1) return "请设置每组晋级人数（至少 1 人）";
  if (size !== null && k > size) return "每组晋级人数不能多于每组人数";
  return groupProblem(form) || "";
}

const swissRoundsError = (form) =>
  form.swissRoundsMode === "manual" && !isValidSwissRounds(form.swissRounds)
    ? `瑞士轮轮数必须在 ${MIN_SWISS_ROUNDS} 至 ${MAX_SWISS_ROUNDS} 之间`
    : "";

/** What blocks leaving a step, or "" when it is complete. */
export function stepError(form, id) {
  if (id === "basics") {
    if (!form.name.trim()) return "请输入赛事名称";
    if (!eventIdFromName(form.name)) return "赛事名称需包含英文或数字（用来生成赛事 ID）";
    if (!(Number(form.capacity) >= 2 && Number(form.capacity) <= 128)) return "选手容量必须在 2 至 128 人之间";
  }
  if ((id === "format" && form.format === "swiss") || (id === "group" && form.groupFormat === "swiss")) {
    const err = swissRoundsError(form);
    if (err) return err;
  }
  if (id === "group") return groupSetupError(form);
  return "";
}

/** Example numbers for the two-stage pages, based on a full field. */
export function groupPreview(form) {
  if (!isTwoStage(form)) return null;
  const n = Number(form.capacity) || 0;
  const size = Number(form.groupSize) || 0;
  const k = Number(form.advancePerGroup) || 0;
  if (n < 2 || k < 1) return null;
  const groups = size >= 2 ? Math.max(1, Math.ceil(n / size)) : 1;
  const qualifiers = groups * k;
  const bracket = 2 ** Math.ceil(Math.log2(Math.max(2, qualifiers)));
  return {
    players: n,
    groups,
    smallest: Math.floor(n / groups),
    largest: Math.ceil(n / groups),
    qualifiers,
    byes: bracket - qualifiers,
  };
}

/**
 * Request body for POST /tournaments, or { error } with the first problem.
 * Returns { id, body }.
 */
export function createEventBody(form) {
  const name = form.name.trim();
  if (!name) return { error: "请输入赛事名称" };
  if (form.pointsEnabled) {
    const problem = pointsTableProblem(form.pointsTable, form.pointsSeason);
    if (problem) return { error: problem };
  }
  const id = eventIdFromName(name);
  if (!id) return { error: "无法根据赛事名称生成合法的赛事 ID，请确保包含英文或数字" };
  if (form.capacity < 2 || form.capacity > 128) return { error: "选手容量必须在 2 至 128 人之间" };
  const manualRounds = usesSwissRounds(form) && form.swissRoundsMode === "manual";
  if (manualRounds && !isValidSwissRounds(form.swissRounds)) {
    return { error: `瑞士轮轮数必须在 ${MIN_SWISS_ROUNDS} 至 ${MAX_SWISS_ROUNDS} 之间` };
  }
  const twoStage = isTwoStage(form);
  if (twoStage) {
    const err = groupSetupError(form, "，留空表示不分组");
    if (err) return { error: err };
  }
  return {
    id,
    body: {
      id,
      name,
      player_capacity: form.capacity,
      hold_third_place: 0,
      loser_advances: form.format === "single_elim" && form.loserAdvances ? 1 : 0,
      scheduled_time: form.scheduledTime || null,
      game_mode: form.gameMode,
      vehicle_pool: form.eventPool,
      points_table: form.pointsEnabled ? cleanTable(form.pointsTable) : null,
      points_season: form.pointsEnabled ? form.pointsSeason.trim() : null,
      points_kind: form.pointsEnabled ? form.pointsKind : null,
      points_invite: form.pointsEnabled && form.pointsInvite,
      // Two-stage: `format` is the group stage, `playoff_format` the playoff.
      format: twoStage ? form.groupFormat : form.format,
      grand_final_reset: (twoStage ? form.playoffFormat === "double_elim" : form.format === "double_elim")
        ? form.grandFinalReset
        : false,
      swiss_rounds: manualRounds ? Number(form.swissRounds) : null,
      banpick_enabled: form.banpickEnabled,
      playoff_format: twoStage ? form.playoffFormat : null,
      swiss_group_size: twoStage ? groupSizeValue(form) : null,
      advance_per_group: twoStage ? Number(form.advancePerGroup) : null,
      checkin_enabled: Boolean(form.checkinEnabled),
      // Copied events keep their tier / kind and template; new ones get defaults.
      ...(form.tier ? { tier: form.tier } : {}),
      ...(form.eventKind ? { event_kind: form.eventKind } : {}),
      ...(form.vehicleTemplate ? { vehicle_template: form.vehicleTemplate } : {}),
    },
  };
}
