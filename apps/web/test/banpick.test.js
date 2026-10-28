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

test("vehicles are grouped in first-seen order", () => {
  assert.deepEqual(grouped.map((g) => g.group), ["A", "B", "C"]);
});

test("A then B ban a group; a pass also moves the turn on", () => {
  let s = ban(initialBanPick(), "A", "A2");
  assert.equal(s.phase, "ban");
  assert.deepEqual(s.bans[0], { by: "A", group: "A", vehicle: "A2" });
  assert.equal(ban(s, "A"), s, "a banned group cannot be banned twice");
  s = ban(s, null);
  assert.equal(s.phase, "drawGroup");
  assert.deepEqual(s.bans[1], { by: "B", group: null, vehicle: null });
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
  for (const file of ["ProLeague-Lineup", "Prop-Lineup", "Lagecy-Jet-Lineup", "Prop-AB-Lineup"]) {
    const vehicles = JSON.parse(readFileSync(new URL(`../src/lib/data/${file}.json`, import.meta.url)));
    for (const g of groupVehicles(vehicles)) {
      const names = g.vehicles.map((v) => v.name);
      assert.equal(new Set(names).size, names.length, `${file} / ${g.group} has duplicate names`);
    }
  }
});

test("a drawn vehicle can be confirmed, which locks the result", async () => {
  const { canConfirm, confirmResult } = await import("../src/lib/banpick.js");
  let s = ban(ban(initialBanPick(), null), null);
  s = confirmGroup(drawGroup(s, grouped, first));
  assert.equal(canConfirm(s), false, "nothing drawn yet");
  assert.equal(confirmResult(s), s);
  s = drawVehicle(s, grouped, first);
  assert.equal(canConfirm(s), true);
  s = confirmResult(s);
  assert.equal(s.phase, "done");
  assert.equal(s.vehicle, "A1");
  assert.equal(drawVehicle(s, grouped, first), s, "locked");
  assert.equal(removeVehicle(s), s, "locked");
  assert.equal(backToGroups(s), s, "locked");
});

test("templates set the number of bans, alternating A and B", async () => {
  const { banTurn, bansOf } = await import("../src/lib/banpick.js");
  let s = initialBanPick({ bansPerPlayer: 2 });
  assert.equal(banTurn(s), "A");
  s = ban(s, "A");
  assert.equal(banTurn(s), "B");
  s = ban(s, null);
  s = ban(s, "B");
  assert.equal(s.phase, "ban");
  s = ban(s, null);
  assert.equal(s.phase, "drawGroup");
  assert.deepEqual(bansOf(s, "A").map((b) => b.group), ["A", "B"]);
  assert.deepEqual(availableGroups(s, grouped), ["C"]);
  assert.equal(initialBanPick({ bansPerPlayer: 0 }).phase, "drawGroup");
});

test("removal limits stop removing and free redraws", async () => {
  const { rerollsLeft } = await import("../src/lib/banpick.js");
  let s = initialBanPick({ bansPerPlayer: 0, groupRerolls: 1, vehicleRerolls: 0 });
  s = drawGroup(s, grouped, first);
  assert.equal(drawGroup(s, grouped, first), s, "no free redraw with a limit");
  s = removeGroup(s);
  assert.equal(rerollsLeft(s).groups, 0);
  s = drawGroup(s, grouped, first);
  assert.equal(removeGroup(s), s, "limit reached");
  s = confirmGroup(s);
  assert.equal(backToGroups(s), s, "no way back with limits");
  s = drawVehicle(s, grouped, first);
  assert.equal(removeVehicle(s), s, "no vehicle removals allowed");
  assert.equal(drawVehicle(s, grouped, first), s);
});

test("a template can end the draw at the group", async () => {
  const { canConfirm, confirmResult, resultLabel } = await import("../src/lib/banpick.js");
  let s = initialBanPick({ bansPerPlayer: 0, drawVehicle: false });
  s = drawGroup(s, grouped, first);
  assert.equal(confirmGroup(s), s, "no vehicle step");
  assert.equal(canConfirm(s), true);
  s = confirmResult(s);
  assert.equal(s.phase, "done");
  assert.equal(resultLabel(s), "A（组内任选）");
});

test("rules are normalized like the server does", async () => {
  const { normalizeRules, rulesSummary, DEFAULT_BP_RULES } = await import("../src/lib/banpick.js");
  assert.deepEqual(normalizeRules(), DEFAULT_BP_RULES);
  assert.equal(normalizeRules({ groupRerolls: "" }).groupRerolls, null);
  assert.equal(normalizeRules({ groupRerolls: "2" }).groupRerolls, 2);
  assert.equal(rulesSummary(), "每人禁 1 组 · 大组可不限次移出 · 载具可不限次移出");
  assert.equal(rulesSummary({ bansPerPlayer: 2, groupRerolls: 1, drawVehicle: false }), "每人禁 2 组 · 大组可移出 1 次 · 抽到大组即结束");
});
