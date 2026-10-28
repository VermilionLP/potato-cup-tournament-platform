import assert from "node:assert/strict";
import { test } from "node:test";
import { overlayStages } from "../src/lib/overlay.js";
import {
  boardBands,
  layoutDoubleTree,
  pickFocusGroup,
  playerLookup,
  swissGroupViews,
  treePositions,
  treeRounds,
  treeSections,
  treeSpecs,
} from "../src/lib/overlay-layout.js";

let id = 0;
const m = (bracket, round, position, p1, p2, winner = null, extra = {}) => ({
  id: ++id, bracket, round, position, player1_id: p1, player2_id: p2, winner_id: winner,
  status: winner ? "completed" : "pending", ...extra,
});

// Single elimination with `n` players, nothing played.
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

test("small brackets are not split into sections", () => {
  const s = treeSections(treeRounds(singleElim(16)));
  assert.equal(s.isLarge, false);
  assert.equal(s.rounds.length, 4);
});

test("32-player brackets show 16-player sections until the final stage starts", () => {
  const rounds = treeRounds(singleElim(32));
  const first = treeSections(rounds, { sectionIndex: 1 });
  assert.equal(first.isLarge, true);
  assert.equal(first.sectionCount, 2);
  assert.equal(first.showFinal, false);
  assert.deepEqual(first.rounds.map((r) => r.matches.length), [8, 4, 2, 1]);
  assert.equal(first.rounds[0].matches[0].player1_id, "p17");
  // A live match in the final stage switches to it.
  const live = treeSections(rounds, { activeRound: 2 });
  assert.equal(live.showFinal, true);
  assert.deepEqual(live.rounds.map((r) => r.round), [2, 1]);
});

test("treePositions centres a match between the two that feed it", () => {
  const rounds = treeRounds(singleElim(4));
  const specs = treeSpecs(2);
  const { centers } = treePositions(rounds, specs);
  const [a, b] = rounds[0].matches;
  const final = rounds[1].matches[0];
  assert.equal(centers[final.id], (centers[a.id] + centers[b.id]) / 2);
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
