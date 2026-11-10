// The finished event's Ban / Pick recap (the results page): for each match
// with a Ban / Pick, the bans of both sides and the locked vehicle; and over
// the event, which vehicles were flown and which groups were banned most.

import { buildMatchOrder } from "./bracket.js";
import { effectiveLog, resultLabel } from "./banpick.js";

const DONE = new Set(["completed", "walkover"]);

/**
 * matches: the event's matches (with .banpick = { state, log }).
 * Returns { rows, vehicles, banned }:
 * rows [{ id, no, p1, p2, winner, score, bansA, bansB, passesA, passesB, vehicle, group, drawnVehicle, locked }]
 * in match order; vehicles [{ name, n, wins: { [playerId]: n } }] most
 * flown first; banned [{ group, n }] most banned first.
 */
export function eventBanpickRecap(matches = [], order = buildMatchOrder(matches)) {
  const rows = [];
  const vehicles = new Map();
  const banned = new Map();
  for (const m of matches) {
    const state = m?.banpick?.state;
    if (!state || !effectiveLog(m.banpick.log || []).length) continue;
    const bans = state.bans || [];
    const side = (s) => bans.filter((b) => b.by === s);
    const locked = state.phase === "done";
    const label = locked ? resultLabel(state) : "";
    for (const b of bans) if (b.group) banned.set(b.group, (banned.get(b.group) || 0) + 1);
    if (label) {
      const v = vehicles.get(label) || { name: label, n: 0 };
      v.n += 1;
      vehicles.set(label, v);
    }
    rows.push({
      id: m.id,
      no: order.get(m.id) ?? null,
      p1: m.player1_id,
      p2: m.player2_id,
      winner: DONE.has(m.status) ? m.winner_id : null,
      score: m.status === "walkover" ? "W/O" : DONE.has(m.status) ? `${m.score1 ?? 0} : ${m.score2 ?? 0}` : "",
      bansA: side("A").filter((b) => b.group).map((b) => b.group),
      bansB: side("B").filter((b) => b.group).map((b) => b.group),
      passesA: side("A").filter((b) => !b.group).length,
      passesB: side("B").filter((b) => !b.group).length,
      vehicle: label,
      group: state.group || "",
      drawnVehicle: Boolean(state.vehicle),
      locked,
    });
  }
  rows.sort((a, b) => (a.no ?? 1e9) - (b.no ?? 1e9) || a.id - b.id);
  const byCount = (x, y) => y.n - x.n || String(x.name ?? x.group).localeCompare(String(y.name ?? y.group));
  return {
    rows,
    vehicles: [...vehicles.values()].sort(byCount),
    banned: [...banned.entries()].map(([group, n]) => ({ group, n })).sort(byCount),
  };
}
