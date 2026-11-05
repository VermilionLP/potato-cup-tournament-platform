import { test } from "node:test";
import assert from "node:assert/strict";
import { placeOf, resultRows, topVehicle } from "../src/lib/result-image.js";

test("result rows: places, prizes and points from the table", () => {
  assert.deepEqual(placeOf("第 1 名 (冠军)"), { from: 1, to: 1 });
  assert.deepEqual(placeOf("第 3-4 名"), { from: 3, to: 4 });
  const standings = [
    { id: "a", display_name: "Alice", flag: "cn", rank: "第 1 名 (冠军)" },
    { id: "b", rank: "第 2 名 (亚军)" },
    { id: "c", rank: "第 3-4 名" },
    { id: "d", rank: "第 3-4 名" },
    { id: "e", rank: "第 5-8 名" },
  ];
  const table = [{ from: 1, to: 1, points: 100, prize: 10000 }, { from: 2, to: 2, points: 60, prize: 5000 }, { from: 3, to: 4, points: 30 }];
  const rows = resultRows(standings, table, 4);
  assert.deepEqual(rows.map((r) => [r.place, r.name, r.prize, r.points]), [["1", "Alice", 10000, 100], ["2", "b", 5000, 60], ["3-4", "c", 0, 30], ["3-4", "d", 0, 30]]);
});

test("the most played vehicle", () => {
  const done = (vehicle, group = "G") => ({ banpick: { state: { phase: "done", vehicle, group } } });
  assert.equal(topVehicle([]), null);
  assert.deepEqual(topVehicle([done("Bf 109"), done("P-51"), done("Bf 109"), { banpick: { state: { phase: "ban" } } }]), { name: "Bf 109", count: 2 });
});
