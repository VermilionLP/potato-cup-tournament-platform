import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveLog, groupVehicles, initialBanPick, localAct, logText, logWho, mayAct, newerRecord, normalizeRules } from "../src/lib/banpick.js";
import * as server from "../../api/lib/banpick.js";

const vehicles = [
  { group: "GA", name: "a1" }, { group: "GA", name: "a2" }, { group: "GB", name: "b1" },
  { group: "GC", name: "c1" }, { group: "GC", name: "c2" }, { group: "GD", name: "d1" },
];
const webGroups = groupVehicles(vehicles);
const serverGroups = server.groupVehicles(vehicles);

// The same actions with the same random numbers lead to the same state here and on the server.
function both(rules, script) {
  let web = initialBanPick(rules);
  let record = server.emptyRecord(normalizeRules(rules));
  for (const [action, args = {}, r = 0] of script) {
    web = localAct(web, webGroups, action, args, () => r);
    const out = server.act(record, { action, ...args }, { grouped: serverGroups, who: { admin: true, side: null }, by: "admin", rand: () => r });
    if (!out.error) record = out.record;
    assert.deepEqual(record.state, web, `after ${action}`);
  }
  return { web, record };
}

test("same transitions as the server", () => {
  both({ bansPerPlayer: 1 }, [
    ["ban", { group: "GA", vehicle: "a1" }], ["pass"], ["drawGroup", {}, 0.4], ["drawGroup", {}, 0.9], ["removeGroup"],
    ["drawGroup", {}, 0], ["confirmGroup"], ["drawVehicle", {}, 0.99], ["removeVehicle"], ["drawVehicle", {}, 0], ["backToGroups"],
    ["drawGroup", {}, 0.5], ["confirmGroup"], ["drawVehicle", {}, 0.5], ["confirm"], ["drawVehicle"],
  ]);
  both({ bansPerPlayer: 0, groupRerolls: 1, vehicleRerolls: 0, drawVehicle: true }, [
    ["drawGroup", {}, 0.7], ["drawGroup", {}, 0.1], ["removeGroup"], ["removeGroup"], ["drawGroup", {}, 0.1], ["confirmGroup"],
    ["drawVehicle"], ["removeVehicle"], ["backToGroups"], ["confirm"],
  ]);
  both({ bansPerPlayer: 2, drawVehicle: false }, [
    ["ban", { group: "GA" }], ["ban", { group: "GA" }], ["ban", { group: "GB" }], ["pass"], ["pass"], ["drawGroup", {}, 0.6], ["confirmGroup"], ["confirm"],
  ]);
});

test("viewer permissions follow the server", () => {
  const { record } = both({ bansPerPlayer: 1 }, [["ban", { group: "GA" }]]);
  // The admin made that ban; replay it as player A to test player undo.
  const asA = server.act(server.emptyRecord(normalizeRules({})), { action: "ban", group: "GA" }, { grouped: serverGroups, who: { admin: false, side: "A" }, by: "pa" }).record;
  for (const [rec, me, id] of [[record, { side: "B" }, "pb"], [asA, { side: "A" }, "pa"], [asA, { side: "B" }, "pb"], [asA, { side: null }, "x"], [null, { side: "A" }, "pa"]]) {
    for (const action of server.ACTIONS) {
      const expected = rec ? !server.actionProblem(rec, action, { admin: false, ...me }, id) : !server.actionProblem(server.emptyRecord(normalizeRules({})), action, { admin: false, ...me }, id);
      assert.equal(mayAct(rec, action, me, id), expected && !(rec === null && action === "undo"), `${action} as ${me.side}`);
    }
  }
  assert.equal(mayAct(record, "reset", { admin: true }, "admin"), true);
});

test("log lines and the newer record", () => {
  assert.equal(logText({ action: "drawGroup", group: "GB" }), "抽到大组 GB");
  assert.equal(logText({ action: "undo", undoneAction: "drawVehicle", vehicle: "c1" }), "撤销：抽到载具 c1");
  assert.equal(logText({ action: "confirm", group: "GC", vehicle: null }), "确认结果：GC（组内任选）");
  assert.equal(logWho({ by: "admin" }), "管理员");
  assert.equal(logWho({ by: "p1" }, (id) => `Name-${id}`), "Name-p1");
  const a = { rev: 2, state: {} };
  const b = { rev: 3, state: {} };
  assert.equal(newerRecord(a, b), b);
  assert.equal(newerRecord(b, a), b);
  assert.equal(newerRecord(null, a), a);
  assert.equal(newerRecord(null, null), null);
  assert.deepEqual(effectiveLog([{ action: "ban", n: 1 }, { action: "reset", n: 2 }, { action: "pass", n: 3, undone: true }, { action: "undo", n: 4 }]), []);
});

test("local undo history is the panel's; localAct ignores unknown actions", () => {
  const s = initialBanPick({ bansPerPlayer: 1 });
  assert.equal(localAct(s, webGroups, "fly"), s);
  assert.deepEqual(localAct(localAct(s, webGroups, "ban", { group: "GA" }), webGroups, "reset"), s);
});
