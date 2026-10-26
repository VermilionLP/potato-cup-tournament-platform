// Ban / Pick rules for a match, kept free of UI state so they can be tested.
//
// Flow: player A bans a vehicle group (or passes), player B bans a group (or
// passes), then a group is drawn at random from the groups still available.
// The group can be accepted or removed (and another drawn). Inside an
// accepted group a vehicle is drawn; a drawn vehicle can be removed and
// another drawn. Removed groups and vehicles never come up again.

export const BP_PHASES = ["banA", "banB", "drawGroup", "drawVehicle"];

/** Vehicles of the tournament's pool; unknown ids fall back to the first pool. */
export function poolVehicles(poolId, pools = []) {
  const pool = pools.find((p) => p.id === poolId) || pools[0];
  return pool ? pool.vehicles : [];
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

export function initialBanPick() {
  return {
    phase: "banA",
    banA: null, // { group, vehicle } or { group: null } for a pass
    banB: null,
    removedGroups: [],
    removedVehicles: [],
    group: null, // drawn group
    groupConfirmed: false,
    vehicle: null, // drawn vehicle name
  };
}

function bannedGroups(state) {
  return [state.banA?.group, state.banB?.group].filter(Boolean);
}

export function isGroupBanned(state, group) {
  return bannedGroups(state).includes(group);
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

/** Bans `group` (null = pass) for whoever's turn it is. */
export function ban(state, group, vehicle = null) {
  if (state.phase !== "banA" && state.phase !== "banB") return state;
  if (group && isGroupBanned(state, group)) return state;
  const entry = { group: group || null, vehicle: group ? vehicle : null };
  return state.phase === "banA"
    ? { ...state, banA: entry, phase: "banB" }
    : { ...state, banB: entry, phase: "drawGroup" };
}

function pick(list, rand) {
  return list.length ? list[Math.floor(rand() * list.length)] : null;
}

export function drawGroup(state, grouped, rand = Math.random) {
  if (state.phase !== "drawGroup") return state;
  return { ...state, group: pick(availableGroups(state, grouped), rand), vehicle: null };
}

/** Removes the drawn group (before it is accepted) so another can be drawn. */
export function removeGroup(state) {
  if (state.phase !== "drawGroup" || !state.group) return state;
  return { ...state, removedGroups: [...state.removedGroups, state.group], group: null };
}

export function confirmGroup(state) {
  if (state.phase !== "drawGroup" || !state.group) return state;
  return { ...state, groupConfirmed: true, phase: "drawVehicle", vehicle: null };
}

/** Back to drawing groups; the accepted group goes back into the pot. */
export function backToGroups(state) {
  if (state.phase !== "drawVehicle") return state;
  return { ...state, groupConfirmed: false, phase: "drawGroup", group: null, vehicle: null };
}

export function drawVehicle(state, grouped, rand = Math.random) {
  if (state.phase !== "drawVehicle") return state;
  return { ...state, vehicle: pick(availableVehicles(state, grouped, state.group), rand) };
}

/** Removes the drawn vehicle so another can be drawn from the same group. */
export function removeVehicle(state) {
  if (state.phase !== "drawVehicle" || !state.vehicle) return state;
  return { ...state, removedVehicles: [...state.removedVehicles, state.vehicle], vehicle: null };
}
