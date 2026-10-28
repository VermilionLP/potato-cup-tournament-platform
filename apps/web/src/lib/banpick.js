// Ban / Pick rules for a match, kept free of UI state so they can be tested.
//
// Flow: the players take turns banning vehicle groups (A, B, A, B... as many
// as the template's rules allow, a pass also uses a turn), then a group is
// drawn at random from the groups still available. The group can be removed
// (and another drawn) or accepted; inside an accepted group a vehicle is
// drawn and can be removed for another one. Removed groups and vehicles never
// come up again. A template can limit the removals, or end at the group
// (any vehicle of it may be used).

// Mirrors normalizeRules in apps/api/lib/vehicle-pools.js.
export const DEFAULT_BP_RULES = { bansPerPlayer: 1, groupRerolls: null, vehicleRerolls: null, drawVehicle: true };

export function normalizeRules(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const int = (v, min, max) => {
    const n = Number(v);
    return v !== null && v !== "" && Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  return {
    bansPerPlayer: int(r.bansPerPlayer, 0, 3) ?? DEFAULT_BP_RULES.bansPerPlayer,
    groupRerolls: int(r.groupRerolls, 0, 20),
    vehicleRerolls: int(r.vehicleRerolls, 0, 20),
    drawVehicle: r.drawVehicle === undefined ? DEFAULT_BP_RULES.drawVehicle : Boolean(r.drawVehicle),
  };
}

/** Rules as a short line: "每人禁 1 组 · 大组可移出 2 次 · 载具可不限次移出". */
export function rulesSummary(raw) {
  const r = normalizeRules(raw);
  const removals = (what, n) => (n === null ? `${what}可不限次移出` : n === 0 ? `${what}不可移出` : `${what}可移出 ${n} 次`);
  return [
    r.bansPerPlayer ? `每人禁 ${r.bansPerPlayer} 组` : "不禁用",
    removals("大组", r.groupRerolls),
    r.drawVehicle ? removals("载具", r.vehicleRerolls) : "抽到大组即结束",
  ].join(" · ");
}

/**
 * Vehicles grouped by `group`, in first-seen order. A name listed more than
 * once in a group (the pool files contain a few repeats, e.g. the German and
 * Soviet MiG-15bis) is shown once; differing nations are merged.
 */
export function groupVehicles(vehicles = []) {
  const groups = new Map();
  for (const v of vehicles) {
    if (!groups.has(v.group)) groups.set(v.group, new Map());
    const byName = groups.get(v.group);
    const seen = byName.get(v.name);
    if (!seen) {
      byName.set(v.name, { ...v });
    } else if (v.nation && seen.nation && !seen.nation.split(" / ").includes(v.nation)) {
      seen.nation = `${seen.nation} / ${v.nation}`;
    }
  }
  return [...groups.entries()].map(([group, byName]) => ({ group, vehicles: [...byName.values()] }));
}

export function initialBanPick(rules) {
  const r = normalizeRules(rules);
  return {
    rules: r,
    phase: r.bansPerPlayer > 0 ? "ban" : "drawGroup",
    bans: [], // [{ by: "A" | "B", group, vehicle }]; group null = a pass
    removedGroups: [],
    removedVehicles: [],
    group: null, // drawn group
    groupConfirmed: false,
    vehicle: null, // drawn vehicle name
  };
}

const rulesOf = (state) => state.rules || DEFAULT_BP_RULES;

/** Whose turn it is to ban ("A" / "B"), or null outside the ban phase. */
export function banTurn(state) {
  return state.phase === "ban" ? (state.bans.length % 2 === 0 ? "A" : "B") : null;
}

/** Bans made by "A" or "B". */
export function bansOf(state, by) {
  return state.bans.filter((b) => b.by === by);
}

function bannedGroups(state) {
  return state.bans.map((b) => b.group).filter(Boolean);
}

export function isGroupBanned(state, group) {
  return bannedGroups(state).includes(group);
}

/** Who banned `group` ("A" / "B"), or null. */
export function bannedBy(state, group) {
  return state.bans.find((b) => b.group === group)?.by || null;
}

/** Groups that can still be drawn: not banned, not removed, with vehicles left. */
export function availableGroups(state, grouped) {
  return grouped
    .filter(
      (g) =>
        !isGroupBanned(state, g.group) &&
        !state.removedGroups.includes(g.group) &&
        g.vehicles.some((v) => !state.removedVehicles.includes(v.name)),
    )
    .map((g) => g.group);
}

/** Vehicles of `group` that can still be drawn. */
export function availableVehicles(state, grouped, group) {
  const entry = grouped.find((g) => g.group === group);
  return entry ? entry.vehicles.filter((v) => !state.removedVehicles.includes(v.name)).map((v) => v.name) : [];
}

/** Removals left: { groups, vehicles }, null = no limit. */
export function rerollsLeft(state) {
  const r = rulesOf(state);
  return {
    groups: r.groupRerolls === null ? null : Math.max(0, r.groupRerolls - state.removedGroups.length),
    vehicles: r.vehicleRerolls === null ? null : Math.max(0, r.vehicleRerolls - state.removedVehicles.length),
  };
}

/** Bans `group` (null = pass) for whoever's turn it is. */
export function ban(state, group, vehicle = null) {
  if (state.phase !== "ban") return state;
  if (group && isGroupBanned(state, group)) return state;
  const bans = [...state.bans, { by: banTurn(state), group: group || null, vehicle: group ? vehicle : null }];
  const done = bans.length >= rulesOf(state).bansPerPlayer * 2;
  return { ...state, bans, phase: done ? "drawGroup" : "ban" };
}

function pick(list, rand) {
  return list.length ? list[Math.floor(rand() * list.length)] : null;
}

/** Draws a group. Redrawing over a drawn group is only free without a removal limit. */
export function drawGroup(state, grouped, rand = Math.random) {
  if (state.phase !== "drawGroup") return state;
  if (state.group && rulesOf(state).groupRerolls !== null) return state;
  return { ...state, group: pick(availableGroups(state, grouped), rand), vehicle: null };
}

/** Removes the drawn group (before it is accepted) so another can be drawn. */
export function removeGroup(state) {
  if (state.phase !== "drawGroup" || !state.group) return state;
  if (rerollsLeft(state).groups === 0) return state;
  return { ...state, removedGroups: [...state.removedGroups, state.group], group: null };
}

/** Accepts the drawn group and moves on to drawing a vehicle from it. */
export function confirmGroup(state) {
  if (state.phase !== "drawGroup" || !state.group || !rulesOf(state).drawVehicle) return state;
  return { ...state, groupConfirmed: true, phase: "drawVehicle", vehicle: null };
}

/** Back to drawing groups (the group goes back in the pot); only without limits. */
export function backToGroups(state) {
  if (state.phase !== "drawVehicle") return state;
  const r = rulesOf(state);
  if (r.groupRerolls !== null || r.vehicleRerolls !== null) return state;
  return { ...state, groupConfirmed: false, phase: "drawGroup", group: null, vehicle: null };
}

/** Draws a vehicle. Redrawing over a drawn one is only free without a removal limit. */
export function drawVehicle(state, grouped, rand = Math.random) {
  if (state.phase !== "drawVehicle") return state;
  if (state.vehicle && rulesOf(state).vehicleRerolls !== null) return state;
  return { ...state, vehicle: pick(availableVehicles(state, grouped, state.group), rand) };
}

/** Removes the drawn vehicle so another can be drawn from the same group. */
export function removeVehicle(state) {
  if (state.phase !== "drawVehicle" || !state.vehicle) return state;
  if (rerollsLeft(state).vehicles === 0) return state;
  return { ...state, removedVehicles: [...state.removedVehicles, state.vehicle], vehicle: null };
}

/** The result can be confirmed once there is one (a vehicle, or a group when the draw ends there). */
export function canConfirm(state) {
  return rulesOf(state).drawVehicle
    ? state.phase === "drawVehicle" && Boolean(state.vehicle)
    : state.phase === "drawGroup" && Boolean(state.group);
}

/** Locks the result; no further bans or draws until reset. */
export function confirmResult(state) {
  return canConfirm(state) ? { ...state, phase: "done" } : state;
}

/** What the match is played with: the vehicle, or "<group>（组内任选）". */
export function resultLabel(state) {
  if (state.vehicle) return state.vehicle;
  return state.group ? `${state.group}（组内任选）` : "";
}
