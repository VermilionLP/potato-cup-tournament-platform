// Vehicle specifications for the Ban / Pick reveal: the server reads them
// from the War Thunder wiki (GET /api/vehicle-specs/<unit>, see the API's
// lib/vehicle-specs.js); specCards() turns them into the overlay's four
// cards: performance, engine, armament, flaps & limits.

const cache = new Map(); // unit -> Promise<specs | null>

/** The vehicle's specifications (null when the wiki has none), fetched once per page. */
export function loadVehicleSpecs(unit, fetchImpl = typeof fetch === "undefined" ? null : fetch) {
  if (!unit || !fetchImpl) return Promise.resolve(null);
  if (!cache.has(unit)) {
    const p = fetchImpl(`/api/vehicle-specs/${encodeURIComponent(unit)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((specs) => {
        // A miss may be the wiki being slow: ask again next time.
        if (!specs) cache.delete(unit);
        return specs;
      });
    cache.set(unit, p);
  }
  return cache.get(unit);
}

const find = (rows, label) => (rows || []).find((r) => r.label === label) || null;
// The event's mode: the wiki has RB and AB figures (SB uses RB).
const pick = (row, mode) => (row ? (mode === "ab" && row.value_ab) || row.value : "");
const plainName = (name) => String(name || "").replace(/^\d+\s*[×x]\s*/, "");
// "AIM-9L Sidewinder air-to-air missiles" -> "AIM-9L Sidewinder".
const shortWeapon = (name) => plainName(name).replace(/\s+(air-to-air|air-to-ground|anti-tank|anti-radiation|guided)?\s*(missiles?|rockets?|bombs?)$/i, "").trim();
const ASPECT = { "All-aspects": "all-aspect", "Rear-aspect": "rear-aspect" };

function rowsOf(list, max) {
  return list.filter((r) => r && r.value !== "" && r.value != null).slice(0, max);
}

/** Overlay rows: { label, value, sub?, accent? } in four titled cards. Empty cards are left out. */
export function specCards(specs, mode = "rb") {
  if (!specs) return [];
  const flight = specs.flight || [];
  const general = specs.general || [];

  const speed = find(flight, "Max speed");
  const performance = rowsOf(
    [
      speed && { label: "Max speed", value: pick(speed, mode), sub: speed.sub || "" },
      { label: "Climb rate", value: pick(find(flight, "Rate of Climb"), mode) },
      { label: "Turn time", value: pick(find(flight, "Turn time"), mode) },
      { label: "Max altitude", value: pick(find(flight, "Max altitude"), mode) },
    ].filter(Boolean),
    4,
  );

  const engineRow = find(general, "Engine");
  const details = engineRow?.details || [];
  const type = [find(details, "Type")?.value, find(details, "Cooling type")?.value && `${find(details, "Cooling type").value}-cooled`].filter(Boolean).join(" · ");
  const thrust = details.some((d) => /thrust/i.test(d.section || ""));
  const POWER = thrust
    ? { Maximum: "Thrust (military)", Afterburner: "Thrust (afterburner)", WEP: "Thrust (WEP)" }
    : { Maximum: "Max power", WEP: "Power with WEP", Afterburner: "Power (afterburner)" };
  const engine = engineRow
    ? rowsOf(
        [
          { label: engineRow.value, value: " ", sub: type, name: true },
          ...details.filter((d) => POWER[d.label]).map((d) => ({ label: POWER[d.label], value: d.value })),
        ],
        4,
      )
    : [];

  // Guns, then air-to-air missiles (one row per type, how it guides), then
  // the ground attack weapons in one row (guided ones first).
  const guns = (specs.guns || []).map((g) => ({
    label: g.name,
    value: `× ${g.count || 1}`,
    sub: [g.ammo, g.rate].filter(Boolean).join(" · "),
    name: true,
  }));
  const seen = new Set();
  const missiles = [];
  const other = [];
  for (const w of specs.suspended || []) {
    const name = shortWeapon(w.name);
    if (seen.has(name)) continue;
    seen.add(name);
    const guidance = find(w.stats, "Guidance")?.value;
    if (guidance && /air-to-air/i.test(w.name)) {
      missiles.push({
        label: name,
        value: w.pylons ? `× ${w.pylons}` : " ",
        sub: [guidance, ASPECT[find(w.stats, "Aspect")?.value] || "", find(w.stats, "Launch range")?.value].filter(Boolean).join(" · "),
        accent: true,
        name: true,
      });
    } else if (/missile/i.test(w.name)) other.unshift(name);
    else other.push(name);
  }
  const countermeasures = (specs.features || []).includes("Flares/Chaff") ? [{ label: "Countermeasures", value: "Flares / chaff" }] : [];
  const restRow = other.length
    ? [{ label: "Ground attack", value: `${other.length} types`, sub: other.slice(0, 3).join(", ") + (other.length > 3 ? "…" : "") }]
    : [];
  const armament = [...guns.slice(0, 2), ...missiles.slice(0, 2), ...restRow, ...countermeasures].slice(0, 4);

  // Flap limits: "L / T / C" with "260 / 409 / 438 km/h".
  const flaps = find(general, "Flap Speed Limit (IAS)");
  const FLAP = { L: "Landing flaps", T: "Take-off flaps", C: "Combat flaps" };
  const flapRows = [];
  if (flaps) {
    const keys = String(flaps.info || "").split("/").map((s) => s.trim());
    const m = /^([\d,./\s]+)\s*(\D.*)?$/.exec(flaps.value || "");
    const values = m ? m[1].split("/").map((s) => s.trim()).filter(Boolean) : [];
    const unit = m?.[2]?.trim() || "km/h";
    if (keys.length && keys.length === values.length) {
      // Combat first: the one used in a fight.
      keys.forEach((k, i) => flapRows.push({ label: FLAP[k] || `Flaps (${k})`, value: `${values[i]} ${unit}`, order: { C: 0, T: 1, L: 2 }[k] ?? 3 }));
      flapRows.sort((a, b) => a.order - b.order);
    } else flapRows.push({ label: "Flaps", value: flaps.value });
  }
  const limits = rowsOf(
    [
      ...flapRows.map(({ label, value }) => ({ label, value })),
      { label: "Wing rip speed (IAS)", value: find(general, "Max Speed Limit (IAS)")?.value || "" },
      { label: "Landing gear", value: find(general, "Gear Speed Limit (IAS)")?.value || "" },
      { label: "Max Mach", value: find(general, "Mach Number Limit")?.value || "" },
      { label: "G limit", value: (find(general, "G limit")?.value || "").replace(/^≈\s*/, "") },
    ],
    4,
  );

  return [
    { title: "PERFORMANCE", rows: performance },
    { title: "ENGINE", rows: engine },
    { title: "ARMAMENT", rows: armament },
    { title: "FLAPS & LIMITS", rows: limits },
  ].filter((c) => c.rows.length);
}
