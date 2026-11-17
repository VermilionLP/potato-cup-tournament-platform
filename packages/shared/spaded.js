// Spaded vehicles (Statshark) and Ban / Pick: a match keeps only the pool
// vehicles both players have spaded, where a vehicle counts as spaded when
// the player spaded it or one of its copies (the pool's copy_of: the same
// vehicle in another nation, a premium copy...). Used by the server (the
// draw) and the page (what it shows), so both keep the same ones.

/** A Statshark id from "67556271" or a profile link (statshark.net/player/67556271); '' for none, null when not valid. */
export function normalizeStatsharkId(input) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  const m = s.match(/statshark\.net\/(?:[a-z]{2}\/)?player\/(\d{1,20})/i) || s.match(/^(\d{1,20})$/);
  return m ? m[1] : null;
}

/** How a vehicle or a Statshark entry is matched: lower case, letters and digits only. */
export const unitKey = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The names / unit ids in a copy_of ("Bf 109 F-4; bf-109f-4_hungary"). */
export const copyList = (value) => String(value ?? '').split(/[;；、\n]+/).map((s) => s.trim()).filter(Boolean);

/** The keys a pool vehicle is known by: its unit id (`unit` or `wiki`), its name and what it is a copy of. */
export function vehicleKeys(v) {
  return [v?.unit, v?.wiki, v?.name, ...copyList(v?.copy_of)].map(unitKey).filter(Boolean);
}

/**
 * Each pool vehicle's family: the keys of every vehicle it is a copy of or
 * that is a copy of it (directly or through others). Map name → Set of keys.
 */
export function vehicleFamilies(vehicles = []) {
  const keys = vehicles.map((v) => new Set(vehicleKeys(v)));
  const parent = vehicles.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map(); // key → first vehicle with it
  keys.forEach((set, i) => {
    for (const k of set) {
      if (owner.has(k)) parent[find(i)] = find(owner.get(k));
      else owner.set(k, i);
    }
  });
  const byRoot = new Map();
  keys.forEach((set, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, new Set());
    for (const k of set) byRoot.get(r).add(k);
  });
  const out = new Map();
  vehicles.forEach((v, i) => {
    const fam = byRoot.get(find(i));
    const prev = out.get(v.name);
    out.set(v.name, prev ? new Set([...prev, ...fam]) : fam);
  });
  return out;
}

/** Names of the pool vehicles a player has spaded (`spaded`: a Set of unitKey()s), copies counted. */
export function spadedNames(vehicles = [], spaded = new Set()) {
  const out = [];
  for (const [name, fam] of vehicleFamilies(vehicles)) if ([...fam].some((k) => spaded.has(k))) out.push(name);
  return out;
}

/**
 * Names of the pool vehicles to leave out of a match: all but those both
 * players have spaded. `a` / `b`: each player's spaded vehicle names in
 * this pool (spadedNames), or null when there is no data for them; then
 * nothing is left out. Nothing is left out either when that would leave no
 * vehicle (the two have no spaded vehicle in common).
 */
export function spadedExcluded(vehicles = [], a = null, b = null) {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  const inB = new Set(b);
  const both = new Set(a.filter((name) => inB.has(name)));
  const names = [...new Set(vehicles.map((v) => v.name))];
  if (!names.some((name) => both.has(name))) return [];
  return names.filter((name) => !both.has(name));
}

/** The vehicles left for a match after `excluded` (names). */
export const withoutExcluded = (vehicles = [], excluded = []) => {
  if (!excluded?.length) return vehicles;
  const out = new Set(excluded);
  return vehicles.filter((v) => !out.has(v.name));
};
