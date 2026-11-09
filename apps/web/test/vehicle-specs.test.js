import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { specCards, loadVehicleSpecs } from "../src/lib/vehicle-specs.js";

// Parsed from the wiki pages in apps/api/test/fixtures (lib/vehicle-specs.js).
const specs = (id) => JSON.parse(readFileSync(new URL(`./fixtures/specs-${id}.json`, import.meta.url), "utf8"));
const card = (cards, title) => cards.find((c) => c.title === title);
const pairs = (c) => c.rows.map((r) => [r.label, r.value.trim()]);

test("a jet's reveal: thrust, gun, missiles, ground attack, flaps", () => {
  const cards = specCards(specs("f_16a_block_10"), "rb");
  assert.deepEqual(cards.map((c) => c.title), ["PERFORMANCE", "ENGINE", "ARMAMENT", "FLAPS & LIMITS"]);
  assert.deepEqual(card(cards, "PERFORMANCE").rows[0], { label: "Max speed", value: "2,156 km/h", sub: "at 10,973 m" });
  assert.deepEqual(pairs(card(cards, "ENGINE")), [["F100-PW-220", ""], ["Thrust (military)", "6,490 kgf"], ["Thrust (afterburner)", "9,000 kgf"]]);
  const arms = card(cards, "ARMAMENT").rows;
  assert.deepEqual(arms.map((r) => r.label), ["20 mm M61A1 cannon", "AIM-9J Sidewinder", "AIM-9L Sidewinder", "Ground attack"]);
  assert.equal(arms[2].sub, "IR · all-aspect · 18 km");
  assert.ok(arms[3].sub.startsWith("AGM-65B"), "guided weapons first");
  assert.deepEqual(pairs(card(cards, "FLAPS & LIMITS")), [["Take-off flaps", "470 km/h"], ["Landing flaps", "463 km/h"], ["Wing rip speed (IAS)", "1,555 km/h"], ["Landing gear", "482 km/h"]]);
});

test("a prop's reveal: power, guns, combat flaps first; AB figures in AB events", () => {
  const cards = specCards(specs("bf-109f-4"), "rb");
  assert.deepEqual(pairs(card(cards, "ENGINE")), [["DB-601E", ""], ["Max power", "1,170 hp"], ["Power with WEP", "1,320 hp"]]);
  assert.equal(card(cards, "ENGINE").rows[0].sub, "Inline, 12-cylinder · Water-cooled");
  assert.deepEqual(pairs(card(cards, "ARMAMENT")), [["20 mm MG 151 cannon", "× 1"], ["7.92 mm MG 17 machine gun", "× 2"]]);
  assert.deepEqual(pairs(card(cards, "FLAPS & LIMITS")), [["Combat flaps", "438 km/h"], ["Take-off flaps", "409 km/h"], ["Landing flaps", "260 km/h"], ["Wing rip speed (IAS)", "790 km/h"]]);
  assert.equal(card(specCards(specs("bf-109f-4"), "ab"), "PERFORMANCE").rows[0].value, "691 km/h");
  assert.deepEqual(specCards(null), []);
});

test("specs are fetched once per vehicle; a miss is asked again", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return url.endsWith("/nope") ? { ok: false } : { ok: true, json: async () => ({ name: "X" }) };
  };
  assert.equal((await loadVehicleSpecs("x-1", fetchImpl)).name, "X");
  await loadVehicleSpecs("x-1", fetchImpl);
  assert.equal(await loadVehicleSpecs("nope", fetchImpl), null);
  await loadVehicleSpecs("nope", fetchImpl);
  assert.deepEqual(calls, ["/api/vehicle-specs/x-1", "/api/vehicle-specs/nope", "/api/vehicle-specs/nope"]);
  assert.equal(await loadVehicleSpecs(null, fetchImpl), null);
});
