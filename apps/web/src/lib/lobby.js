// Labels for the event lists in the lobby (routes/+page.svelte). Pure
// helpers, tested with node --test.

import { formatInZone, toInstant } from "./datetime.js";

/** "今天" / "明天" / "昨天" / "3 天后" / "5 天前" for a date. */
export function relativeDay(value, now = new Date()) {
  if (value == null) return "未知时间";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "未知时间";
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === -1) return "昨天";
  if (diff > 0) return `${diff} 天后`;
  return `${-diff} 天前`;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const pad = (n) => String(n).padStart(2, "0");

/** Start time in the viewer's time zone (stored as Beijing time). */
export function startTimeLabel(raw) {
  if (!raw) return "";
  const instant = toInstant(raw);
  if (instant) return formatInZone(instant);
  const m = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[^\d]*(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return `${m[1]}/${pad(m[2])}/${pad(m[3])} ${WEEKDAYS[d.getDay()]} ${pad(m[4])}:${pad(m[5])}`;
  }
  const dm = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (dm) {
    const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
    return `${dm[1]}/${pad(dm[2])}/${pad(dm[3])} ${WEEKDAYS[d.getDay()]}`;
  }
  return String(raw);
}

/** Tooltip with the Beijing time behind a converted start time. */
export function beijingTitle(raw, converted = true) {
  const instant = toInstant(raw);
  if (!instant) return undefined;
  return `北京时间 ${formatInZone(instant, "Asia/Shanghai")}${converted ? "（已换算为你的时区）" : ""}`;
}

function scheduledDateTime(t) {
  const raw = t?.scheduled_time;
  if (!raw) return null;
  const instant = toInstant(raw);
  if (instant) return instant;
  const m = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[^\d]*(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] == null ? 20 : Number(m[4]), m[5] == null ? 0 : Number(m[5]));
}

/** "已开赛" / "25 分钟后" / "3 小时后" / "2 天后". */
export function countdownLabel(t, now = Date.now()) {
  const d = scheduledDateTime(t);
  if (!d) return "";
  const diff = d.getTime() - now;
  if (diff <= 0) return "已开赛";
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `${mins} 分钟后`;
  const hours = Math.ceil(mins / 60);
  if (hours < 24) return `${hours} 小时后`;
  return `${Math.ceil(hours / 24)} 天后`;
}

export function actionLabel(t) {
  if (t.status === "voting") return "去投票";
  if (t.status === "registration") return "去报名";
  if (t.status === "in_progress") return "看对阵";
  return "查看";
}

/** Capacity shown next to the player count: the next bracket size up. */
export function displayCapacity(t) {
  const count = t?.player_count || 0;
  const tier = [8, 16, 32, 64, 128].find((value) => value > count) ?? 128;
  return Math.min(Number(t?.player_capacity) || 128, tier);
}

/** Best-known event date: the scheduled day, else when it was created. */
export function eventDate(t) {
  const raw = t?.scheduled_time;
  if (raw) {
    const m = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return t?.created_at ? new Date(t.created_at) : null;
}

const GRADIENTS = [
  "from-amber-500 to-orange-500",
  "from-purple-500 to-indigo-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-fuchsia-500",
];

/** Avatar gradient for an event, stable per ID. */
export function eventGradient(id) {
  let s = 0;
  for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
  return GRADIENTS[s % GRADIENTS.length];
}

const STATUS = {
  registration: { label: "报名中", style: "bg-sky-500/10 text-sky-400 border-sky-500/30" },
  voting: { label: "投票中", style: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  in_progress: { label: "比赛进行中", style: "bg-amber-500/10 text-primary border-primary/30" },
  completed: { label: "已结束", style: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30" },
};

export const statusLabel = (status) => STATUS[status]?.label || status;
export const statusStyle = (status) => STATUS[status]?.style || "bg-zinc-500/10 text-zinc-400";
