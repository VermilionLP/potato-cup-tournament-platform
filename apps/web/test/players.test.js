import assert from "node:assert/strict";
import { test } from "node:test";
import { filterPlayers, mineFirst, wikiUrl } from "../src/lib/players.js";

const players = [
  { id: "a", display_name: "Alice", team: "PC" },
  { id: "b", display_name: "Bob", team: "" },
  { id: "c", display_name: "Carol" },
];

test("filterPlayers matches ID, display name or team, ignoring case", () => {
  assert.deepEqual(filterPlayers(players, "pc").map((p) => p.id), ["a"]);
  assert.deepEqual(filterPlayers(players, "BO").map((p) => p.id), ["b"]);
  assert.equal(filterPlayers(players, "").length, 3);
});

test("mineFirst moves your own entry to the front", () => {
  assert.deepEqual(mineFirst(players, "c").map((p) => p.id), ["c", "a", "b"]);
  assert.equal(mineFirst(players, "zz"), players);
});

test("wikiUrl links page names to Liquipedia and keeps full URLs", () => {
  assert.equal(wikiUrl("Vermilion"), "https://liquipedia.net/warthunder/Vermilion");
  assert.equal(wikiUrl("https://example.com/x"), "https://example.com/x");
});
