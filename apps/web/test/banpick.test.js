import assert from "node:assert/strict";
import { test } from "node:test";
import {
  availableGroups,
  availableVehicles,
  backToGroups,
  ban,
  confirmGroup,
  drawGroup,
  drawVehicle,
  groupVehicles,
  initialBanPick,
  poolVehicles,
  removeGroup,
  removeVehicle,
} from "../src/lib/banpick.js";

const vehicles = [
  { name: "A1", group: "A" },
  { name: "A2", group: "A" },
  { name: "B1", group: "B" },
  { name: "C1", group: "C" },
  { name: "C2", group: "C" },
];
const grouped = groupVehicles(vehicles);
const first = () => 0; // always picks the first available option

test("uses the tournament's own vehicle pool", () => {
  const pools = [
    { id: "proleague", vehicles: [{ name: "F-15E", group: "F-15" }] },
    { id: "prop", vehicles: vehicles },
  ];
  assert.equal(poolVehicles("prop", pools), vehicles);
  assert.deepEqual(poolVehicles("unknown", pools), pools[0].vehicles);
  assert.deepEqual(grouped.map((g) => g.group), ["A", "B", "C"]);
});

test("A then B ban a group; a pass also moves the turn on", () => {
  let s = ban(initialBanPick(), "A", "A2");
  assert.equal(s.phase, "banB");
  assert.deepEqual(s.banA, { group: "A", vehicle: "A2" });
  assert.equal(ban(s, "A"), s, "a banned group cannot be banned twice");
  s = ban(s, null);
  assert.equal(s.phase, "drawGroup");
  assert.deepEqual(s.banB, { group: null, vehicle: null });
  assert.deepEqual(availableGroups(s, grouped), ["B", "C"]);
});

test("a removed group is never drawn again", () => {
  let s = ban(ban(initialBanPick(), "A"), null);
  s = drawGroup(s, grouped, first);
  assert.equal(s.group, "B");
  s = removeGroup(s);
  assert.deepEqual(availableGroups(s, grouped), ["C"]);
  s = drawGroup(s, grouped, first);
  assert.equal(s.group, "C");
});

test("inside an accepted group, removed vehicles are never drawn again", () => {
  let s = ban(ban(initialBanPick(), "A"), "B");
  s = confirmGroup(drawGroup(s, grouped, first));
  assert.equal(s.phase, "drawVehicle");
  s = drawVehicle(s, grouped, first);
  assert.equal(s.vehicle, "C1");
  s = removeVehicle(s);
  assert.deepEqual(availableVehicles(s, grouped, "C"), ["C2"]);
  s = drawVehicle(s, grouped, first);
  assert.equal(s.vehicle, "C2");
  s = removeVehicle(s);
  assert.equal(drawVehicle(s, grouped, first).vehicle, null, "group exhausted");
  // An exhausted group drops out of the group draw.
  s = backToGroups(s);
  assert.deepEqual(availableGroups(s, grouped), []);
});

test("actions outside their phase do nothing", () => {
  const s = initialBanPick();
  assert.equal(drawGroup(s, grouped), s);
  assert.equal(confirmGroup(s), s);
  assert.equal(drawVehicle(s, grouped), s);
  assert.equal(removeVehicle(s), s);
});

test("repeated vehicle names are listed once per group", () => {
  const grouped = groupVehicles([
    { name: "MiG-15bis", group: "MiG", nation: "Germany" },
    { name: "MiG-15bis", group: "MiG", nation: "USSR" },
    { name: "Bf 109 F-2", group: "Bf 109", nation: "Germany" },
    { name: "Bf 109 F-2", group: "Bf 109", nation: "Germany" },
  ]);
  assert.deepEqual(grouped.map((g) => g.vehicles.map((v) => v.name)), [["MiG-15bis"], ["Bf 109 F-2"]]);
  assert.equal(grouped[0].vehicles[0].nation, "Germany / USSR");
  assert.equal(grouped[1].vehicles[0].nation, "Germany");
});

test("every bundled pool groups without duplicate names", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["ProLeague-Lineup", "Prop-Lineup", "Lagecy-Jet-Lineup"]) {
    const vehicles = JSON.parse(readFileSync(new URL(`../src/lib/data/${file}.json`, import.meta.url)));
    for (const g of groupVehicles(vehicles)) {
      const names = g.vehicles.map((v) => v.name);
      assert.equal(new Set(names).size, names.length, `${file} / ${g.group} has duplicate names`);
    }
  }
});
