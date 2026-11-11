// The 年度 Top20 page (routes/top): moving players in the admin's list,
// Beijing times for the start picker and when each place is revealed.
// Mirrors apps/api/lib/season-top.js (one place a day, last place first). Pure.

import { SOURCE_OFFSET_MINUTES } from "./datetime.js";

export const TOP_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" in Beijing time for a moment (DateTimePicker's value), or "". */
export function beijingValue(at) {
  const t = at ? new Date(at).getTime() : NaN;
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + SOURCE_OFFSET_MINUTES * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** When place `rank` of `size` is revealed (a Date), or null. */
export function revealDate(startAt, rank, size) {
  const t = startAt ? new Date(startAt).getTime() : NaN;
  if (!Number.isFinite(t) || rank < 1 || rank > size) return null;
  return new Date(t + (size - rank) * DAY_MS);
}

/** The list with item i moved by `delta` (-1 up, +1 down); unchanged at the ends. */
export function move(list, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= list.length || i < 0 || i >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * Whether place index i (0 = #1) is already out: revealed places count from
 * the end of the list.
 */
export function isLocked(i, size, revealedCount) {
  return i >= size - revealedCount;
}

/** "2026-12-01", the Beijing date of a moment, or "". */
export function dayText(date) {
  return beijingValue(date).slice(0, 10);
}
