import assert from "node:assert/strict";
import { test } from "node:test";
import { modesLabel, parsePoolFile, poolToCsv, poolToJson, resolveTemplate, vehicleListProblem } from "../src/lib/vehicle-pools.js";

test("events use the most specific template of their type unless one is chosen", () => {
  const templates = [
    { id: "prop", event_type: "prop", game_modes: [], sort_order: 10 },
    { id: "prop-ab", event_type: "prop", game_modes: ["ab"], sort_order: 20 },
    { id: "bvr", event_type: "proleague", game_modes: [], sort_order: 40 },
  ];
  assert.equal(resolveTemplate(templates, { vehicle_pool: "prop", game_mode: "ab" }).id, "prop-ab");
  assert.equal(resolveTemplate(templates, { vehicle_pool: "prop", game_mode: "rb" }).id, "prop");
  assert.equal(resolveTemplate(templates, { vehicle_pool: "prop", game_mode: "rb", vehicle_template: "bvr" }).id, "bvr");
  assert.equal(resolveTemplate(templates, { vehicle_pool: "legacy-jet", game_mode: "rb" }), null);
  assert.equal(modesLabel([]), "全部模式");
  assert.equal(modesLabel(["ab", "rb"]), "AB · RB");
});

test("JSON and CSV export round-trip through import", () => {
  const vehicles = [
    { name: 'He 162 "Salamander"', nation: "Germany", br: 7.7, type: "Jet", group: "He 162, early" },
    { name: "Yak-15", nation: "USSR", br: null, type: "Jet", group: "Yak-15" },
  ];
  assert.deepEqual(parsePoolFile(poolToJson(vehicles), "pool.json"), vehicles);
  assert.deepEqual(parsePoolFile(poolToCsv(vehicles), "pool.csv"), vehicles);
  assert.deepEqual(parsePoolFile(JSON.stringify({ vehicles })), vehicles);
});

test("imports are checked", () => {
  assert.throws(() => parsePoolFile(""), /空/);
  assert.throws(() => parsePoolFile("{oops", "a.json"), /JSON 格式/);
  assert.throws(() => parsePoolFile('{"a":1}'), /载具列表/);
  assert.throws(() => parsePoolFile("nation,br\nUSA,1"), /name/);
  assert.throws(() => parsePoolFile("name,br\nYak-3,abc"), /第 1 行（Yak-3）的 BR/);
  // CSV columns can come in any order; group defaults to the name.
  assert.deepEqual(parsePoolFile("﻿br,name\r\n3.3,Yak-1\r\n"), [{ name: "Yak-1", nation: "", br: 3.3, type: "", group: "Yak-1" }]);
  assert.equal(vehicleListProblem([{ name: " " }]), "第 1 行缺少载具名称");
  assert.equal(vehicleListProblem([{ name: "a", br: "" }]), "");
});

test("bundled AB prop pool is valid", async () => {
  const { readFile } = await import("node:fs/promises");
  const list = JSON.parse(await readFile(new URL("../src/lib/data/Prop-AB-Lineup.json", import.meta.url), "utf8"));
  assert.equal(list.length, 59);
  assert.equal(vehicleListProblem(list), "");
});

test("preview: unsaved rows as Ban / Pick uses them, and a summary per group", async () => {
  const { previewVehicles, groupSummary } = await import("../src/lib/vehicle-pools.js");
  const rows = [
    { name: " F-16A ", nation: "USA", br: "12.3", type: "Jet", group: "F-16" },
    { name: "F-16C", nation: "USA", br: 13.7, type: "Jet", group: "F-16" },
    { name: "▄F-16A", nation: "France", br: "", type: "Jet", group: "F-16" },
    { name: "Su-27", nation: "USSR", br: "x", type: "", group: "" },
    { name: "", nation: "USSR", br: "1", group: "empty" },
    { name: "F-16A", nation: "Israel", br: 12.7, group: "F-16" },
  ];
  const vehicles = previewVehicles(rows);
  assert.deepEqual(vehicles.map((v) => [v.name, v.group, v.br]), [
    ["F-16A", "F-16", 12.3],
    ["F-16C", "F-16", 13.7],
    ["▄F-16A", "F-16", null],
    ["Su-27", "Su-27", null],
    ["F-16A", "F-16", 12.7],
  ]);
  assert.deepEqual(groupSummary(vehicles), [
    { group: "F-16", count: 3, brMin: 12.3, brMax: 13.7, nations: ["USA", "France", "Israel"] },
    { group: "Su-27", count: 1, brMin: null, brMax: null, nations: ["USSR"] },
  ]);
});
