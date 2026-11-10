import assert from "node:assert/strict";
import { test } from "node:test";
import { eventBanpickRecap } from "../src/lib/event-banpick.js";

const bp = (state, log = [{ action: "ban", n: 1 }]) => ({ state, log });

test("the results page's Ban / Pick recap: per match in bracket order, flown vehicles and most banned groups", () => {
  const matches = [
    { id: 2, bracket: "se", round: 1, position: 1, player1_id: "a", player2_id: "b", status: "completed", winner_id: "a", score1: 2, score2: 1,
      banpick: bp({ phase: "done", group: "P-47", vehicle: "P-47D-28", bans: [{ by: "A", group: "Bf 109" }, { by: "B", group: null }] }) },
    { id: 1, bracket: "se", round: 2, position: 1, player1_id: "c", player2_id: "d", status: "walkover", winner_id: "d",
      banpick: bp({ phase: "done", group: "Yak", vehicle: null, bans: [{ by: "A", group: "Bf 109" }, { by: "B", group: "P-51" }] }) },
    { id: 3, bracket: "se", round: 1, position: 2, player1_id: "e", player2_id: "f", status: "pending",
      banpick: bp({ phase: "drawGroup", bans: [] }) },
    { id: 4, bracket: "se", round: 1, position: 3, player1_id: "g", player2_id: "h", status: "pending", banpick: null },
    { id: 5, bracket: "se", round: 1, position: 4, status: "pending", banpick: bp({ phase: "ban", bans: [] }, []) },
  ];
  const r = eventBanpickRecap(matches);
  assert.deepEqual(r.rows.map((x) => x.id), [1, 2, 3]);
  const first = r.rows.find((x) => x.id === 2);
  assert.deepEqual([first.bansA, first.bansB, first.passesB, first.vehicle, first.score, first.winner], [["Bf 109"], [], 1, "P-47D-28", "2 : 1", "a"]);
  assert.equal(r.rows.find((x) => x.id === 1).vehicle, "Yak（组内任选）");
  assert.equal(r.rows.find((x) => x.id === 1).score, "W/O");
  assert.equal(r.rows.find((x) => x.id === 3).locked, false);
  assert.deepEqual(r.vehicles.map((v) => [v.name, v.n]), [["P-47D-28", 1], ["Yak（组内任选）", 1]]);
  assert.deepEqual(r.banned, [{ group: "Bf 109", n: 2 }, { group: "P-51", n: 1 }]);
});
