// "分享到 Discord": a post about the event to paste into Discord, with
// Discord's dynamic timestamps (<t:unix:F>, shown in every reader's own
// time zone), in Chinese or English (`lang`; labels from the site's
// dictionary). Pure; the dialog is ShareDialog.svelte.

import { GAME_MODES, eventFormatLabel, vehiclePoolLabel } from "./tournament.js";
import { placeName, prizeRows } from "./points.js";
import { translate } from "./i18n/translate.js";

// The post's own wording; site labels go through the site's dictionary.
const TEXT = {
  zh: {
    groups: (size, k) => (size ? `每组 ${size} 人，前 ${k} 名晋级` : `前 ${k} 名晋级`),
    roundRobin: "瑞士轮单循环",
    rounds: (n) => `瑞士轮 ${n} 轮`,
    reset: "总决赛可重置",
    prizes: (list) => `💰 奖金：${list}`,
    prizeOf: (r) => `${placeName(r)}${r.to > r.from ? "各" : ""} ${r.prize} 金鹰币`,
    coins: (n) => ` · ${n} 金鹰币`,
    format: (f, n) => `🏆 赛制：${f}${n == null ? "" : ` · ${n} 名选手`}`,
    resultsLink: (u) => `🔗 对阵与名次：${u}`,
    time: (f, r) => `🗓️ 比赛时间：${f}（${r}）`,
    voting: "🗓️ 比赛时间：投票中，欢迎来投票选时间",
    signups: (n, cap) => `👥 报名：${n} / ${cap} 人`,
    running: (n) => `🔴 比赛进行中 · ${n} 名选手`,
    checkin: (t) => `✅ 需要签到：${t} 开放（开赛前 30 分钟）`,
    checkinNoTime: "✅ 需要在网站上签到",
    points: (season, monthly, invite) => `📊 计入 ${season} 赛季积分榜（${monthly ? "月赛" : "周赛"}）${invite ? "，冠军直邀总决赛" : ""}`,
    link: { registration: "🔗 报名：", voting: "🔗 投票：", other: "🔗 对阵：" },
    mode: (m) => `${m.code} ${m.name}`,
    label: (x) => x,
  },
  en: {
    groups: (size, k) => (size ? `groups of ${size}, top ${k} advance` : `top ${k} advance`),
    roundRobin: "Swiss round robin",
    rounds: (n) => `${n} Swiss rounds`,
    reset: "grand final reset",
    prizes: (list) => `💰 Prizes: ${list}`,
    prizeOf: (r) => `${r.from === r.to ? ordinal(r.from) : `${ordinal(r.from)}–${ordinal(r.to)}`} ${r.prize} GE${r.to > r.from ? " each" : ""}`,
    coins: (n) => ` · ${n} GE`,
    format: (f, n) => `🏆 Format: ${f}${n == null ? "" : ` · ${n} players`}`,
    resultsLink: (u) => `🔗 Bracket and placings: ${u}`,
    time: (f, r) => `🗓️ Starts ${f} (${r})`,
    voting: "🗓️ Time: being voted on, come and pick one",
    signups: (n, cap) => `👥 Signed up: ${n} / ${cap}`,
    running: (n) => `🔴 Live now · ${n} players`,
    checkin: (t) => `✅ Check-in opens at ${t} (30 minutes before the start)`,
    checkinNoTime: "✅ Check in on the site before the start",
    points: (season, monthly, invite) => `📊 Counts for the ${season} points season (${monthly ? "monthly" : "weekly"})${invite ? ", the champion is invited to the finals" : ""}`,
    link: { registration: "🔗 Sign up: ", voting: "🔗 Vote: ", other: "🔗 Bracket: " },
    mode: (m) => `${m.code} ${m.full}`,
    label: (x) => translate(x),
  },
};
const textOf = (lang) => TEXT[lang] || TEXT.zh;

export const DISCORD_LIMIT = 2000;
const CHECKIN_LEAD_S = 30 * 60;

/** Unix seconds of "YYYY-MM-DDTHH:mm" in Beijing time, or null. */
export function scheduledUnix(scheduled) {
  const m = String(scheduled || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]) / 1000;
}

/** Discord timestamp: F = full date and time, R = relative ("in 2 days"), t = time. */
export const stamp = (unix, style = "F") => (unix == null ? "" : `<t:${unix}:${style}>`);

/** The format with its details: groups, Swiss rounds, reset. */
export function formatLine(t, lang = "zh") {
  const T = textOf(lang);
  const parts = [T.label(eventFormatLabel(t))];
  if (t.playoff_format) parts.push(T.groups(t.swiss_group_size, t.advance_per_group));
  if (t.format === "swiss") {
    const rounds = t.swiss_rounds_effective ?? t.swiss_rounds;
    parts.push(t.swiss_rounds_auto || !t.swiss_rounds ? T.roundRobin : T.rounds(rounds));
  }
  const doubleElim = t.playoff_format ? t.playoff_format === "double_elim" : t.format === "double_elim";
  if (doubleElim && t.grand_final_reset) parts.push(T.reset);
  return parts.join(" · ");
}

const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

/** "💰 奖金：冠军 2500 金鹰币 · …" from the points table's prizes, or "". */
export function prizeLine(table, lang = "zh") {
  const rows = prizeRows(table);
  if (!rows.length) return "";
  const T = textOf(lang);
  return T.prizes(rows.map((r) => T.prizeOf(r)).join(" · "));
}

/** The prize for a finishing place (1, 2, 3 …), or 0. */
function prizeFor(table, place) {
  return prizeRows(table).find((r) => place >= r.from && place <= r.to)?.prize || 0;
}

/**
 * The post. `kind`: "announce" (time, mode and vehicle type, format,
 * sign-up, prizes) or "results" (podium with prizes). The vehicle type
 * (历史模式 · 螺旋桨) stands for the pool; the site has the full list.
 * opts: { siteUrl, podium: [names per place], lang }.
 */
export function shareMessage(t, { kind = "announce", siteUrl = "", podium = [], lang = "zh" } = {}) {
  const T = textOf(lang);
  const url = siteUrl ? `${siteUrl.replace(/\/+$/, "")}/tournament/${encodeURIComponent(t.id)}` : "";
  const mode = GAME_MODES.find((m) => m.id === t.game_mode);
  const players = t.players?.length ?? t.player_count ?? 0;
  const lines = [`## 🥔 ${t.name}`];

  if (kind === "results") {
    const medals = ["🥇", "🥈", "🥉"];
    podium.slice(0, 3).forEach((names, i) => {
      const coins = prizeFor(t.points_table, i + 1);
      if (names.length) lines.push(`${medals[i]} **${names.join(" / ")}**${coins ? T.coins(coins) : ""}`);
    });
    lines.push(T.format(formatLine(t, lang), players));
    if (url) lines.push(T.resultsLink(url));
    return lines.join("\n");
  }

  const unix = scheduledUnix(t.scheduled_time);
  if (unix != null) lines.push(T.time(stamp(unix, "F"), stamp(unix, "R")));
  else if (t.status === "voting") lines.push(T.voting);
  const type = t.vehicle_pool ? T.label(vehiclePoolLabel(t.vehicle_pool)) : "";
  lines.push(`🎮 ${[mode ? T.mode(mode) : "", type].filter(Boolean).join(" · ")}`);
  lines.push(T.format(formatLine(t, lang), null));
  if (t.status === "registration") lines.push(T.signups(players, t.player_capacity));
  else if (t.status === "in_progress") lines.push(T.running(players));
  if (t.checkin?.enabled && t.status === "registration") {
    lines.push(unix != null ? T.checkin(stamp(unix - CHECKIN_LEAD_S, "t")) : T.checkinNoTime);
  }
  const prizes = prizeLine(t.points_table, lang);
  if (prizes) lines.push(prizes);
  if (t.points_table?.length) lines.push(T.points(t.points_season, t.points_kind === "monthly", t.points_invite));
  if (url) lines.push(`${T.link[t.status] || T.link.other}${url}`);
  return lines.join("\n");
}

/** Splits a post into messages under Discord's limit, at line breaks. */
export function splitForDiscord(text, limit = DISCORD_LIMIT) {
  const parts = [];
  let current = "";
  for (const line of text.split("\n")) {
    const pieces = line.length > limit ? line.match(new RegExp(`.{1,${limit}}`, "gs")) : [line];
    for (const piece of pieces) {
      const next = current ? `${current}\n${piece}` : piece;
      if (next.length > limit && current) {
        parts.push(current);
        current = piece;
      } else current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
}
