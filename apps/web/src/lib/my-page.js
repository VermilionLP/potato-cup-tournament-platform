// 我的 (/me): the signed-in player's events still to play and events they
// could still sign up for. Pure.

import { scheduledDateTime } from "./lobby.js";

const ORDER = { in_progress: 0, registration: 1, voting: 2 };
const startOf = (t) => scheduledDateTime(t)?.getTime() ?? Infinity;

/** Events the player is in that haven't finished: running first, then by start. */
export function myActiveEvents(tournaments = []) {
  return tournaments
    .filter((t) => t.status && t.status !== "completed")
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || startOf(a) - startOf(b));
}

/** Events open for sign-up (or voting on a time) the player isn't in, soonest first. */
export function openToJoin(all = [], mine = [], limit = 3) {
  const ids = new Set(mine.map((t) => t.id));
  return all
    .filter((t) => (t.status === "registration" || t.status === "voting") && !ids.has(t.id))
    .sort((a, b) => startOf(a) - startOf(b))
    .slice(0, limit);
}

/** Finished events, newest first. */
export function myRecentEvents(tournaments = [], limit = 5) {
  const when = (t) => String(t.played_at || t.scheduled_time || t.created_at || "");
  return tournaments
    .filter((t) => t.status === "completed")
    .sort((a, b) => when(b).localeCompare(when(a)))
    .slice(0, limit);
}
