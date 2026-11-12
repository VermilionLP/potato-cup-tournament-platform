import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, matchScore, searchSite, flatResults } from "../src/lib/site-search.js";

test("fold and match scores", () => {
  assert.equal(fold("Kirito_0_1"), "kirito01");
  assert.equal(matchScore("Vermilion", "vermilion"), 0);
  assert.equal(matchScore("Vermilion", "verm"), 1);
  assert.equal(matchScore("Potato Cup Weekly #31", "weekly"), 2);
  assert.equal(matchScore("Potato Cup Weekly #31", "31"), 2);
  assert.equal(matchScore("_botya_", "oty"), 3);
  assert.equal(matchScore("Vermilion", "xyz"), -1);
  assert.equal(matchScore("live-rm52r6", "ver"), -1);
  assert.equal(matchScore("", "a"), -1);
});

test("players by match then recent activity; events newest first", () => {
  const players = [
    { id: "Akira", last_seen_at: "2026-01-01" },
    { id: "AkumaZ", last_seen_at: "2026-11-01" },
    { id: "Kaka", team: "AK" },
    { id: "ak", last_seen_at: null },
  ];
  const events = [
    { id: "a", name: "Potato Cup Weekly #1", played_at: "2026-01-01" },
    { id: "b", name: "Potato Cup Weekly #2", played_at: "2026-02-01" },
    { id: "c", name: "June Cup" },
  ];
  const res = searchSite("ak", { players, events });
  assert.deepEqual(res.players.map((p) => p.id), ["ak", "AkumaZ", "Akira", "Kaka"]);
  assert.deepEqual(searchSite("weekly", { players, events }).events.map((e) => e.id), ["b", "a"]);
  assert.deepEqual(searchSite("", { players, events }), { players: [], events: [], pages: [] });
});

test("pages by Chinese or English words, and the flat list", () => {
  assert.equal(searchSite("天梯", {}).pages[0].href, "/ladder");
  assert.equal(searchSite("ladder", {}).pages[0].href, "/ladder");
  assert.deepEqual(searchSite("a", {}).pages, []); // one letter is too short for pages
  const flat = flatResults({ pages: [{ href: "/hall" }], players: [{ id: "x y" }], events: [{ id: "e1" }] });
  assert.deepEqual(flat.map((r) => r.href), ["/hall", "/player/x%20y", "/tournament/e1"]);
});
