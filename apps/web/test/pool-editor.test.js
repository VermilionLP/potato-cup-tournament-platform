import { test } from "node:test";
import assert from "node:assert/strict";
import { draftOf, draftProblem, emptyVehicle, newDraft, saveBody, templatesByType, toggleMode } from "../src/lib/pool-editor.js";

const tpl = { id: "a", name: "螺旋桨", event_type: "prop", game_modes: ["rb"], rules: { bansPerPlayer: 2 }, sort_order: 5, vehicles: [{ name: "P-47D", br: "4.3", group: "美国" }] };

test("drafts are copies", () => {
  const d = draftOf(tpl);
  d.vehicles[0].name = "X";
  d.game_modes.push("ab");
  assert.equal(tpl.vehicles[0].name, "P-47D");
  assert.deepEqual(tpl.game_modes, ["rb"]);
  assert.equal(d.rules.bansPerPlayer, 2);
  assert.equal(newDraft(tpl).name, "螺旋桨 副本");
  assert.equal(newDraft(null, "prop").event_type, "prop");
  assert.deepEqual(newDraft(null, "prop").vehicles, [emptyVehicle()]);
});

test("problems, body and grouping", () => {
  assert.equal(draftProblem({ ...draftOf(tpl), name: " " }), "请填写模板名称");
  assert.equal(draftProblem(draftOf(tpl)), "");
  assert.notEqual(draftProblem({ name: "x", vehicles: [] }), "");
  const body = saveBody({ ...draftOf(tpl), name: " 新名 ", sort_order: "7", vehicles: [{ name: "A", br: "" }, { name: "B", br: "5.7" }] });
  assert.equal(body.name, "新名");
  assert.equal(body.sort_order, 7);
  assert.deepEqual(body.vehicles.map((v) => v.br), [null, 5.7]);
  assert.deepEqual(toggleMode(["rb"], "ab"), ["rb", "ab"]);
  assert.deepEqual(toggleMode(["rb", "ab"], "rb"), ["ab"]);
  const grouped = templatesByType([{ id: "b", event_type: "prop", sort_order: 9 }, { id: "a", event_type: "prop", sort_order: 1 }, { id: "c", event_type: "jet" }], [{ id: "prop" }, { id: "jet" }]);
  assert.deepEqual(grouped.map((g) => g.templates.map((t) => t.id)), [["a", "b"], ["c"]]);
});
