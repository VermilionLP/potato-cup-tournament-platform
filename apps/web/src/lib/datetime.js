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
