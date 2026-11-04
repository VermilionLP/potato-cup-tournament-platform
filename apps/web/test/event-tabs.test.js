import { test } from "node:test";
import assert from "node:assert/strict";
import { activeTabOf, eventTabs, tabFromHash } from "../src/lib/event-tabs.js";

test("event page tabs", () => {
  const ids = (t, o) => eventTabs(t, o).map((x) => x.id);
  assert.deepEqual(ids({ status: "voting", players: [] }), ["overview", "bracket", "players", "live"]);
  assert.deepEqual(ids({ status: "voting" }, { isAdmin: true }), ["overview", "bracket", "pool", "players", "live"]);
  assert.deepEqual(ids({ status: "voting" }, { isAdmin: true, banpickEnabled: false }), ["overview", "bracket", "players", "live"]);
  assert.deepEqual(ids({}, { hasTemplate: true }), ["overview", "bracket", "pool", "players", "live"]);
  assert.equal(eventTabs({ status: "registration" })[1].label, "对阵预览");
  assert.equal(eventTabs({ players: [1, 2] }).find((t) => t.id === "players").count, 2);
  assert.equal(activeTabOf({ status: "in_progress" }), "bracket");
  assert.equal(activeTabOf({ status: "registration" }), "overview");
  assert.equal(activeTabOf({ status: "in_progress" }, "live"), "live");
  assert.equal(tabFromHash("#pool"), "pool");
  assert.equal(tabFromHash("#nope"), "");
});
