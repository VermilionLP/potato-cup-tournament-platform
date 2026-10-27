import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePools, parsePoolFile, poolToCsv, poolToJson, vehicleListProblem } from "../src/lib/vehicle-pools.js";

const bundled = [
  { id: "proleague", vehicles: [{ name: "F-15E", nation: "USA", br: 14, type: "Jet", group: "F-15" }] },
  { id: "prop", vehicles: [{ name: "Yak-3", nation: "USSR", br: 4, type: "Fighter", group: "Yak" }] },
];

test("saved pools replace the bundled ones; types keep their order", () => {
  const pools = mergePools({ prop: { vehicles: [{ name: "Bf 109" }], updated_at: "t" } }, bundled);
  assert.deepEqual(pools.map((p) => [p.id, p.custom, p.vehicles.length]), [
    ["prop", true, 1], ["legacy-jet", false, 0], ["proleague", false, 1],
  ]);
  assert.equal(pools[0].vehicles[0].name, "Bf 109");
  assert.equal(pools[0].defaults[0].name, "Yak-3");
  assert.equal(pools[0].name, "螺旋桨");
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
