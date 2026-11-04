import { test } from "node:test";
import assert from "node:assert/strict";
import { DELTA_TYPES, mergeLive } from "../src/lib/live-merge.js";

test("a live delta replaces changed matches, drops removed ones, keeps players", () => {
  const current = {
    id: "t", status: "in_progress", players: [{ id: "a" }], votes: [],
    matches: [{ id: 1, score1: 0 }, { id: 2, score1: 0 }, { id: 3 }], synced_at: "x",
  };
  const delta = { delta: true, status: "completed", synced_at: "y", match_ids: [2, 1], changed_matches: [{ id: 2, score1: 2 }] };
  const { tournament, complete } = mergeLive(current, delta);
  assert.equal(complete, true);
  assert.deepEqual(tournament.matches, [{ id: 2, score1: 2 }, { id: 1, score1: 0 }]);
  assert.equal(tournament.status, "completed");
  assert.equal(tournament.synced_at, "y");
  assert.deepEqual(tournament.players, [{ id: "a" }]);
  assert.equal(tournament.delta, undefined);
  assert.equal(mergeLive(current, { match_ids: [1, 9], changed_matches: [] }).complete, false, "unknown match: reload");
  assert.ok(DELTA_TYPES.has("score_updated") && !DELTA_TYPES.has("player_registered"));
});
