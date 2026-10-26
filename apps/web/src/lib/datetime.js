// Match-time helpers. Times are stored as local "YYYY-MM-DDTHH:mm" strings
// (the format of <input type="datetime-local">).

export const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
// Calendar columns, Monday first.
export const WEEKDAY_HEADERS = ["一", "二", "三", "四", "五", "六", "日"];

const pad = (n) => String(n).padStart(2, "0");

/** Parses "YYYY-MM-DDTHH:mm" (or with a space); null when not in that shape. */
export function parseLocal(value) {
  const m = String(value ?? "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], hh: +m[4], mm: +m[5] };
}

export function toValue(y, m, d, time) {
  return `${y}-${pad(m)}-${pad(d)}T${time}`;
}

export function timeOf(parts) {
  return parts ? `${pad(parts.hh)}:${pad(parts.mm)}` : "";
}

export function sameDay(a, b) {
  return Boolean(a && b) && a.y === b.y && a.m === b.m && a.d === b.d;
}

/** "2026/11/01 周日 20:30"; anything unparsable is shown as stored. */
export function formatScheduled(value) {
  const p = parseLocal(value);
  if (!p) return String(value ?? "");
  const weekday = WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()];
  return `${p.y}/${pad(p.m)}/${pad(p.d)} ${weekday} ${timeOf(p)}`;
}

/** Weeks (Monday first) covering month `m` of year `y`; days outside it have inMonth=false. */
export function monthGrid(y, m) {
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // days before the 1st, Monday = 0
  const start = new Date(y, m - 1, 1 - lead);
  const weeks = [];
  const cursor = new Date(start);
  do {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({
        y: cursor.getFullYear(),
        m: cursor.getMonth() + 1,
        d: cursor.getDate(),
        inMonth: cursor.getMonth() === m - 1,
        weekend: cursor.getDay() === 0 || cursor.getDay() === 6,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === m - 1);
  return weeks;
}

export function shiftMonth(y, m, delta) {
  const date = new Date(y, m - 1 + delta, 1);
  return { y: date.getFullYear(), m: date.getMonth() + 1 };
}

/** True when the day is before today (local time). */
export function isPastDay(day, now = new Date()) {
  const a = new Date(day.y, day.m - 1, day.d);
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return a < b;
}

/** Evening slots offered as one-tap times. */
export const TIME_SLOTS = [
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00", "23:30",
];

// Stored match times are Beijing time (UTC+8), matching the .ics export in
// apps/api/lib/calendar.js. Viewers elsewhere get them converted.
export const SOURCE_TIME_ZONE = "Asia/Shanghai";
export const SOURCE_OFFSET_MINUTES = 8 * 60;
export const SOURCE_LABEL = "北京时间";

/** The real moment of a stored "YYYY-MM-DDTHH:mm" (Beijing) time, or null. */
export function toInstant(value) {
  const p = parseLocal(value);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - SOURCE_OFFSET_MINUTES * 60000);
}

/** Viewer's IANA time zone, e.g. "Asia/Tokyo"; undefined if unknown. */
export function viewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function zoneParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const out = {};
  for (const part of fmt.formatToParts(date)) out[part.type] = part.value;
  return out;
}

const EN_WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** "2026/11/01 周日 21:30" for `date` as seen in `timeZone` (default: viewer's). */
export function formatInZone(date, timeZone = undefined) {
  const p = zoneParts(date, timeZone);
  return `${p.year}/${p.month}/${p.day} ${WEEKDAYS[EN_WEEKDAYS[p.weekday]]} ${p.hour}:${p.minute}`;
}

/** UTC offset of `timeZone` at `date`, in minutes. */
export function zoneOffsetMinutes(date, timeZone = undefined) {
  const p = zoneParts(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

/** "UTC+9", "UTC-4:30". */
export function offsetLabel(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${pad(m)}` : ""}`;
}

/**
 * Live countdown text. Returns { phase: "before" | "after", text } where text
 * is "3 天 04:12:09" / "04:12:09" before the start and "已开赛 1 小时 5 分" after.
 */
export function countdown(target, now = new Date()) {
  const diff = target.getTime() - now.getTime();
  if (diff > 0) {
    const total = Math.floor(diff / 1000);
    const days = Math.floor(total / 86400);
    const clock = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
    return { phase: "before", text: days > 0 ? `${days} 天 ${clock}` : clock };
  }
  const mins = Math.floor(-diff / 60000);
  const text = mins < 60 ? `已开赛 ${mins} 分钟` : `已开赛 ${Math.floor(mins / 60)} 小时 ${mins % 60} 分`;
  return { phase: "after", text };
}
