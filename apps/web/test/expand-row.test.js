import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleRows } from "../src/lib/expand-row.js";

test("long boards show the first rows, the open row, or everything while searching", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}` }));
  assert.equal(visibleRows(rows, 30).length, 30);
  assert.equal(visibleRows(rows, 30, { selectedId: "p70" }).length, 71, "stretched to the open row");
  assert.equal(visibleRows(rows, 30, { selectedId: "p5" }).length, 30);
  assert.equal(visibleRows(rows, 30, { searching: true }).length, 100);
  assert.equal(visibleRows(rows, Infinity).length, 100);
});
