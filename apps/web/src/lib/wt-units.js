// War Thunder unit ids for vehicle pool pictures. Vehicles keep an optional
// `wiki` unit id; without one it is looked up by name in /wt-units.json
// (built by tools/wt-units/build-index.mjs from the datamine), preferring
// the version of the vehicle's own nation and aircraft over ground units of
// the same name. Pictures: the wiki's tech-tree slot images, through the
// API's cache (routes/vehicle-images.js), the wiki itself as a fallback.

/** Letters and digits only, lower case: "Bf 109 F-4" -> "bf109f4". */
export function looseName(name) {
  return String(name || "")
    .normalize("NFKC")
    .replace(/[ -⯿⸀-⹿-​ ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]/g, "");
}

// Id parts that name a nation (copies of a vehicle in another tree).
const NATION_PARTS = {
  usa: ["usa", "us"],
  germany: ["germany", "german", "luftwaffe", "germ"],
  ussr: ["ussr", "soviet"],
  britain: ["uk", "britain", "raf", "rn"],
  japan: ["japan", "jap", "ija", "ijn", "jasdf"],
  italy: ["italy", "italian", "it"],
  france: ["france", "fr"],
  china: ["china", "cn", "prc", "roc"],
  sweden: ["sweden", "swe", "sw"],
  israel: ["israel", "isr", "iaf"],
};
const OTHER_PARTS = ["hungary", "finland", "thailand", "romania", "blue", "impulse", "event", "tutorial"];
const ALL_PARTS = [...new Set([...Object.values(NATION_PARTS).flat(), ...OTHER_PARTS])];
const GROUND_PREFIX = /^(us|germ|ussr|uk|jp|it|fr|cn|sw|il)_/;
const hasPart = (id, part) => new RegExp(`(^|_)${part}($|_)`).test(id);

/** The unit id among candidates for a vehicle of `nation` ("USA", "Germany"...). */
export function pickUnit(candidates, nation = "", ground = false) {
  let list = Array.isArray(candidates) ? [...candidates] : candidates ? [candidates] : [];
  if (list.length <= 1) return list[0] || null;
  const kind = list.filter((id) => GROUND_PREFIX.test(id) === ground);
  if (kind.length) list = kind;
  if (list.length === 1) return list[0];
  const own = list.filter((id) => (NATION_PARTS[String(nation).toLowerCase()] || []).some((p) => hasPart(id.replace(GROUND_PREFIX, ""), p)));
  if (own.length === 1) return own[0];
  const plain = list.filter((id) => !ALL_PARTS.some((p) => hasPart(id.replace(GROUND_PREFIX, ""), p)));
  if (plain.length === 1) return plain[0];
  return (own[0] || plain[0] || list[0]) ?? null;
}

const GROUND_TYPES = /tank|spaa|destroyer|ground|坦克|防空/i;

/**
 * Unit id of a pool vehicle: its own `wiki`, else the `unit` the server
 * filled in, else a lookup by name.
 */
export function unitIdOf(vehicle, index) {
  if (vehicle?.wiki) return vehicle.wiki;
  if (vehicle?.unit !== undefined) return vehicle.unit;
  const found = index?.names?.[looseName(vehicle?.name)];
  return pickUnit(found, vehicle?.nation, GROUND_TYPES.test(vehicle?.type || ""));
}

export const WIKI_STATIC = "https://static.encyclopedia.warthunder.com";
export const slotImage = (id) => `/api/vehicle-images/slots/${encodeURIComponent(id)}.png`;
export const slotImageDirect = (id) => `${WIKI_STATIC}/slots/${encodeURIComponent(id)}.png`;
export const wikiPage = (id) => `https://wiki.warthunder.com/unit/${encodeURIComponent(id)}`;

const NATION_FILES = { usa: "usa", germany: "germany", ussr: "ussr", britain: "britain", japan: "japan", italy: "italy", france: "france", china: "china", sweden: "sweden", israel: "israel" };
/** The nation's flag as on the wiki ("country_usa"), or null. */
export function nationFlag(nation) {
  const key = NATION_FILES[String(nation || "").toLowerCase()];
  return key ? { cached: `/api/vehicle-images/country/${key}.png`, direct: `${WIKI_STATIC}/unit_tooltip/country_${key}.png` } : null;
}

let indexPromise = null;
/** /wt-units.json, loaded once. */
export function loadUnitIndex(fetchImpl = typeof fetch === "undefined" ? null : fetch) {
  if (!indexPromise && fetchImpl) {
    indexPromise = fetchImpl("/wt-units.json")
      .then((r) => (r.ok ? r.json() : { names: {} }))
      .catch(() => ({ names: {} }));
  }
  return indexPromise || Promise.resolve({ names: {} });
}

/**
 * Groups of a pool for the picture view: [{ group, nations, vehicles: [{ ...v, unit }] }]
 * in pool order, each vehicle once per group.
 */
export function poolGroups(vehicles = [], index = null) {
  const groups = new Map();
  for (const v of vehicles) {
    if (!groups.has(v.group)) groups.set(v.group, { group: v.group, nations: [], vehicles: [], names: new Set() });
    const g = groups.get(v.group);
    if (g.names.has(v.name)) continue;
    g.names.add(v.name);
    if (v.nation && !g.nations.includes(v.nation)) g.nations.push(v.nation);
    g.vehicles.push({ ...v, unit: unitIdOf(v, index) });
  }
  return [...groups.values()].map(({ names, ...g }) => g);
}
