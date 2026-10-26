import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDoubleElimPlan,
  resolveDoubleElimRows,
  seedingOrder,
} from "../lib/double-elim.js";

const byKey = (rows) => new Map(rows.map((row) => [row.key, row]));

test("seeding order keeps the standard bracket spread", () => {
  assert.deepEqual(seedingOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedingOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test("a full 8-player double elimination has 2N-2 matches", () => {
  const plan = buildDoubleElimPlan(8);
  assert.equal(plan.k, 3);
  assert.equal(plan.nodes.filter((n) => n.bracket === "wb").length, 7);
  assert.equal(plan.nodes.filter((n) => n.bracket === "lb").length, 6);
  assert.equal(plan.nodes.filter((n) => n.bracket === "gf").length, 1);
  assert.equal(plan.nodes.length, 14);
});

test("4 and 16 player brackets keep the 2N-2 match count", () => {
  const four = buildDoubleElimPlan(4);
  assert.equal(four.nodes.length, 6);
  assert.equal(four.nodes.filter((n) => n.bracket === "lb").length, 2);
  assert.equal(four.lbRounds, 2);

  const sixteen = buildDoubleElimPlan(16);
  assert.equal(sixteen.nodes.length, 30);
  assert.equal(sixteen.nodes.filter((n) => n.bracket === "wb").length, 15);
  assert.equal(sixteen.nodes.filter((n) => n.bracket === "lb").length, 14);
  assert.equal(sixteen.lbRounds, 6);
});

test("winners bracket rounds are numbered from the final", () => {
  const plan = buildDoubleElimPlan(8);
  const wb = plan.nodes.filter((n) => n.bracket === "wb");
  assert.deepEqual(
    [...new Set(wb.map((n) => n.round))].sort((a, b) => b - a),
    [3, 2, 1],
  );
  assert.equal(plan.nodes.find((n) => n.key === "wb:1:1").sources[0].key, "wb:2:1");
  assert.equal(plan.nodes.find((n) => n.key === "wb:1:1").sources[1].key, "wb:2:2");
});

test("losers bracket rounds are numbered from the final too", () => {
  const plan = buildDoubleElimPlan(8);
  const lbRounds = [
    ...new Set(plan.nodes.filter((n) => n.bracket === "lb").map((n) => n.round)),
  ].sort((a, b) => b - a);
  assert.deepEqual(lbRounds, [4, 3, 2, 1]);
  const lbFinal = plan.nodes.find((n) => n.key === "lb:1:1");
  assert.equal(lbFinal.sources[0].key, "wb:1:1");
  assert.equal(lbFinal.sources[1].key, "lb:2:1");
});

test("a 5-player field resolves byes before the tournament starts", () => {
  const rows = resolveDoubleElimRows(["p1", "p2", "p3", "p4", "p5"]);
  const map = byKey(rows);

  // Seeded 1 and 2 plus one more player get a first-round bye.
  const wb1 = [...map.values()].filter(
    (row) => row.bracket === "wb" && row.round === 3,
  );
  assert.equal(
    wb1.filter((row) => row.status === "completed" && row.winner_id).length,
    3,
  );
  assert.equal(
    wb1.filter((row) => row.status === "pending").length,
    1,
  );

  // Loser of a bye is nothing, so the dependent losers-bracket slot is void.
  const lbFirst = map.get("lb:4:1");
  assert.equal(lbFirst.status, "pending");
  assert.equal(lbFirst.slot1_void, true);
  assert.equal(lbFirst.slot2_void, false);

  // Two bye losers never meet: that match can never be played.
  const lbVoid = map.get("lb:4:2");
  assert.equal(lbVoid.status, "completed");
  assert.equal(lbVoid.winner_id, null);
});

test("winner and loser links point at the next bracket slots", () => {
  const rows = resolveDoubleElimRows([
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
    "p8",
  ]);
  const map = byKey(rows);

  const wbFinal = map.get("wb:1:1");
  assert.equal(wbFinal.next_key, "gf:1:1");
  assert.equal(wbFinal.next_slot, 1);
  assert.equal(wbFinal.loser_next_key, "lb:1:1");
  assert.equal(wbFinal.loser_next_slot, 1);

  const lbFinal = map.get("lb:1:1");
  assert.equal(lbFinal.next_key, "gf:1:1");
  assert.equal(lbFinal.next_slot, 2);
  assert.equal(lbFinal.loser_next_key, null);

  const wbR1First = map.get("wb:3:1");
  assert.equal(wbR1First.loser_next_key, "lb:4:1");
  assert.equal(wbR1First.loser_next_slot, 1);
  const wbR1Second = map.get("wb:3:2");
  assert.equal(wbR1Second.loser_next_key, "lb:4:1");
  assert.equal(wbR1Second.loser_next_slot, 2);

  // Cross feed: the top half winner of LB round 1 meets the bottom half
  // winners-bracket loser, not the player who just beat them.
  assert.equal(map.get("wb:2:2").loser_next_key, "lb:3:1");
  assert.equal(map.get("lb:4:1").next_key, "lb:3:1");
  assert.equal(map.get("lb:4:1").next_slot, 2);
});

test("double elimination refuses fields smaller than four", () => {
  assert.throws(() => resolveDoubleElimRows(["a", "b", "c"]), /at least 4/);
});
