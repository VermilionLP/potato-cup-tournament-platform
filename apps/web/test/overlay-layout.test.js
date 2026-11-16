import assert from "node:assert/strict";
import { test } from "node:test";
import { overlayStages } from "../src/lib/overlay.js";
import {
  boardBands,
  layoutDoubleTree,
  layoutSingleTree,
  pickFocusGroup,
  playerLookup,
  swissGroupViews,
  treePlacement,
  treeRounds,
} from "../src/lib/overlay-layout.js";

let id = 0;
const m = (bracket, round, position, p1, p2, winner = null, extra = {}) => ({
  id: ++id, bracket, round, position, player1_id: p1, player2_id: p2, winner_id: winner,
  status: winner ? "completed" : "pending", ...extra,
});

// Single elimination with `n` players, nothing played (rounds linked by position, as the server makes them).
function singleElim(n) {
  const out = [];
  for (let r = Math.log2(n); r >= 1; r -= 1) {
    for (let p = 1; p <= 2 ** (r - 1); p += 1) out.push(m("main", r, p, r === Math.log2(n) ? `p${2 * p - 1}` : null, r === Math.log2(n) ? `p${2 * p}` : null));
  }
  return out;
}

test("playerLookup names, seeds and flags players; TBD for an empty slot", () => {
  const who = playerLookup([{ id: "a", display_name: "Alice", seed: 3, flag: "jp" }]);
  assert.equal(who.name("a"), "Alice");
  assert.equal(who.name(null), "TBD");
  assert.equal(who.name("zz"), "zz");
  assert.equal(who.seed("a"), 3);
  assert.equal(who.flag("a"), "jp");
});

test("treeRounds lists the first round first", () => {
  const rounds = treeRounds(singleElim(8));
  assert.deepEqual(rounds.map((r) => r.round), [3, 2, 1]);
  assert.deepEqual(rounds[0].matches.map((x) => x.position), [1, 2, 3, 4]);
});

test("single elimination is drawn whole, each match between the two that feed it", () => {
  const matches = singleElim(32);
  const tree = layoutSingleTree(matches, (x) => `R${x.round}`);
  assert.equal(tree.items.length, 31, "no sections: every match");
  assert.equal(tree.headers.length, 5);
  const at = (match) => tree.items.find((i) => i.match.id === match.id);
  const final = matches.find((x) => x.round === 1);
  const semis = matches.filter((x) => x.round === 2);
  assert.equal(at(final).y, (at(semis[0]).y + at(semis[1]).y) / 2);
  assert.ok(semis.every((s) => at(s).x < at(final).x));
  assert.equal(tree.paths.length, 30);
  assert.equal(layoutSingleTree([m("wb", 1, 1, "a", "b")]), null);
});

test("the third-place match sits under the final", () => {
  const matches = singleElim(4);
  const third = m("main", 0, 1, null, null);
  const tree = layoutSingleTree([...matches, third], (x) => (x.round === 0 ? "3RD PLACE" : `R${x.round}`));
  const at = (match) => tree.items.find((i) => i.match.id === match.id);
  const final = matches.find((x) => x.round === 1);
  assert.equal(at(third).x, at(final).x);
  assert.ok(at(third).y > at(final).y);
  assert.ok(tree.headers.some((h) => h.label === "3RD PLACE"));
  assert.ok(tree.height >= at(third).y);
});

test("the side panel goes under a wide tree, stays beside a tall one", () => {
  // Wide and short (a 12-player double elimination is about 1780 × 770).
  const wide = treePlacement({ width: 1780, height: 770 });
  assert.equal(wide.placement, "bottom");
  // Tall (32-player single elimination).
  const tall = treePlacement(layoutSingleTree(singleElim(32)));
  assert.equal(tall.placement, "side");
  assert.ok(tall.scale > 0.55, "still readable");
  // Small: beside, at most 1.3×.
  const small = treePlacement(layoutSingleTree(singleElim(4)));
  assert.equal(small.placement, "side");
  assert.equal(small.scale, 1.3);
});

test("layoutDoubleTree places the grand final right of both brackets", () => {
  const wbFinal = m("wb", 1, 1, "a", "c");
  const lbFinal = m("lb", 1, 1, null, null);
  const gf = m("gf", 1, 1, null, null);
  const matches = [
    m("wb", 2, 1, "a", "b", null, { next_match_id: wbFinal.id }), m("wb", 2, 2, "c", "d"), wbFinal,
    m("lb", 2, 1, "b", "d"), lbFinal, gf,
  ];
  wbFinal.next_match_id = gf.id;
  lbFinal.next_match_id = gf.id;
  const tree = layoutDoubleTree(matches, (x) => `${x.bracket}${x.round}`);
  const gfItem = tree.items.find((i) => i.match.id === gf.id);
  assert.ok(tree.items.every((i) => i.match.id === gf.id || i.x < gfItem.x));
  assert.ok(tree.paths.length >= 3);
  assert.equal(layoutDoubleTree([m("sw", 1, 1, "a", "b")]), null);
});

test("boardBands keeps the selected Swiss round and the one before", () => {
  const sw = [1, 2, 3, 4].map((r) => m("sw", r, 1, "a", "b"));
  const bands = boardBands(overlayStages(sw), "sw:3");
  assert.equal(bands.length, 1);
  assert.deepEqual(bands[0].columns.map((c) => c.key), ["sw:2", "sw:3"]);
});

test("grouped Swiss: each group has its own current round; the live group is shown", () => {
  const g = (group, round, p1, p2, winner = null) => m("sw", round, 1, p1, p2, winner, { swiss_group: group });
  const matches = [g(1, 1, "a", "b", "a"), g(1, 2, "a", "c"), g(2, 1, "d", "e")];
  const groups = swissGroupViews(overlayStages(matches), { per_group: 1, groups: [{ label: "A", rows: [] }, { label: "B", rows: [] }] });
  assert.equal(groups[0].current.round, 2);
  assert.equal(groups[1].current.round, 1);
  assert.equal(pickFocusGroup(groups, { liveMatch: matches[2] }).label, "B");
  assert.equal(pickFocusGroup(groups, { lastLabel: "A" }).label, "A");
  assert.equal(pickFocusGroup(groups, { tick: 1 }).label, "B");
  assert.deepEqual(swissGroupViews(overlayStages(matches), { groups: [{ label: "A" }] }), []);
});
