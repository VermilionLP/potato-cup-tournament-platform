// Spaded vehicles (Statshark) and Ban / Pick: the pool vehicles neither
// player of a match has spaded are left out. Used by the server (the draw)
// and the page (what it shows), so both leave out the same ones.

/** A Statshark id from "67556271" or a profile link (statshark.net/player/67556271); '' for none, null when not valid. */
export function normalizeStatsharkId(input) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  const m = s.match(/statshark\.net\/(?:[a-z]{2}\/)?player\/(\d{1,20})/i) || s.match(/^(\d{1,20})$/);
  return m ? m[1] : null;
}

/** How a vehicle or a Statshark entry is matched: lower case, letters and digits only. */
export const unitKey = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The keys a pool vehicle is known by: its unit id (`unit` or `wiki`) and its name. */
export function vehicleKeys(v) {
  return [v?.unit, v?.wiki, v?.name].map(unitKey).filter(Boolean);
}

/** Whether `spaded` (a Set of unitKey()s) has the vehicle. */
export const hasSpaded = (spaded, v) => vehicleKeys(v).some((k) => spaded.has(k));

/**
 * Names of the pool vehicles to leave out of a match: those neither player
 * has spaded. `a` / `b`: each player's spaded vehicle names in this pool
 * (arrays), or null when there is no data for them; then nothing is left
 * out. Nothing is left out either when that would leave no vehicle.
 */
export function spadedExcluded(vehicles = [], a = null, b = null) {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  const has = new Set([...a, ...b]);
  const out = [...new Set(vehicles.map((v) => v.name).filter((name) => !has.has(name)))];
  return out.length >= new Set(vehicles.map((v) => v.name)).size ? [] : out;
}

/** The vehicles left for a match after `excluded` (names). */
export const withoutExcluded = (vehicles = [], excluded = []) => {
  if (!excluded?.length) return vehicles;
  const out = new Set(excluded);
  return vehicles.filter((v) => !out.has(v.name));
};
