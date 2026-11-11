import { test } from "node:test";
import assert from "node:assert/strict";
import { ordinal, recapTiles, recapRows, recapTitles, titleChips, pointsLine } from "../src/lib/season-recap-image.js";

const recap = {
  season: "2026",
  player: { id: "a", name: "Alpha", flag: "cn" },
  events: 4, matches: 9, wins: 7, losses: 2, win_rate: 7 / 9, titles: 2, podiums: 3, best_streak: 7, peak_mmr: 3398,
  title_events: [{ id: "w31", name: "Potato Cup Weekly #31" }, { id: "w32", name: "Potato Cup Weekly #32" }],
  best: { place: 1, to: 1, event: { id: "w31", name: "Potato Cup Weekly #31" } },
  rival: { id: "b", name: "Bravo", played: 4, won: 2 },
  vehicle: { name: "T-80B", times: 1 },
  points: { total: 245, rank: 1, of: 8 },
};

test("ordinals", () => {
  assert.deepEqual([ordinal(1), ordinal(2), ordinal(3), ordinal(11), ordinal(22), ordinal(3, 4), ordinal(5, 8)], ["1st", "2nd", "3rd", "11th", "22nd", "3-4th", "5-8th"]);
});

test("recap tiles and lines", () => {
  assert.deepEqual(recapTiles(recap).map((t) => [t.label, t.value]), [["EVENTS", "4"], ["MATCHES", "7-2"], ["WIN RATE", "78%"], ["TITLES", "2"], ["BEST STREAK", "7"], ["PEAK MMR", "3398"]]);
  assert.deepEqual(recapRows(recap), [
    { label: "Most faced", text: "Bravo  ·  2-2 in 4 matches" },
    { label: "Most played vehicle", text: "T-80B  ·  1 match" },
  ]);
  assert.equal(pointsLine(recap), "245 PTS  ·  #1 of 8");
  assert.equal(pointsLine({ points: null }), "");
  assert.deepEqual(recapRows({ events: 1 }), []);
  assert.deepEqual(recapRows({ best: { place: 3, to: 4, event: { name: "Potato Cup Weekly #9" } } }), [{ label: "Best finish", text: "3-4th  ·  Weekly #9" }]);
  assert.equal(recapTiles({ win_rate: null })[2].value, "—");
});

test("titles newest first, and a +N chip when they don't fit", () => {
  const r = { title_events: [{ name: "Potato Cup Weekly #1", date: "2026-01-05" }, { name: "2026 June Cup - Europe", date: "2026-06-20" }, { name: "Potato Cup Weekly #9" }] };
  assert.deepEqual(recapTitles(r), ["2026 June Cup - Europe", "Weekly #1", "Weekly #9"]);
  const names = ["a", "b", "c", "d", "e"];
  assert.deepEqual(titleChips(names, 6).map((c) => c.text), names);
  assert.deepEqual(titleChips(names, 4), [{ text: "a", more: false }, { text: "b", more: false }, { text: "c", more: false }, { text: "+2 more", more: true }]);
  assert.deepEqual(titleChips(names, 0), []);
});
