import { test } from "node:test";
import assert from "node:assert/strict";
import { eventRecord, eventsPlayed, headToHeadRecent, meetings, versusSide } from "../src/lib/versus.js";

test("VS card sides and meetings", () => {
  const matches = [
    { status: "completed", player1_id: "a", player2_id: "x", winner_id: "a" },
    { status: "walkover", player1_id: "y", player2_id: "a", winner_id: "a" },
    { status: "completed", player1_id: "a", player2_id: "z", winner_id: "z" },
    { status: "pending", player1_id: "a", player2_id: "b" },
  ];
  assert.deepEqual(eventRecord(matches, "a"), { won: 2, lost: 1 });
  const ladder = {
    mmr: 3120, tier: { group: "gold", name: "黄金 1" }, games: 12, win_rate: 0.6,
    history: [
      { game_id: 9, opponent_id: "b", won: false, score_for: 1, score_against: 2, tournament_name: "W9" },
      { game_id: 8, opponent_id: "c", won: true, score_for: 2, score_against: 0 },
      { game_id: 7, opponent_id: "b", won: true, score_for: 2, score_against: 1, tournament_name: "W7" },
    ],
  };
  const side = versusSide(ladder, matches, "a");
  assert.equal(side.mmr, 3120);
  assert.deepEqual(side.form.map((g) => g.won), [false, true, true]);
  assert.deepEqual(meetings(ladder, "b"), { won: 1, lost: 1, last: { event: "W9", score: "2 : 1", won: false } });
  assert.equal(meetings(ladder, "q"), null);
  assert.deepEqual(versusSide(null, [], "n"), { mmr: null, tier: null, games: 0, winRate: null, form: [], event: { won: 0, lost: 0 } });
});

test("matchup preview: recent meetings and events played", () => {
  const ladder = {
    history: [
      { tournament_id: "w9", opponent_id: "b", won: false, score_for: 1, score_against: 2, tournament_name: "W9", played_at: "2026-10-17T12:00:00Z" },
      { tournament_id: "w8", opponent_id: "c", won: true, score_for: 2, score_against: 0 },
      { tournament_id: "w7", opponent_id: "b", won: true, score_for: 2, score_against: 1, tournament_name: "W7", played_at: "2026-10-03T12:00:00Z" },
    ],
  };
  const h = headToHeadRecent(ladder, "b");
  assert.deepEqual([h.won, h.lost, h.mapsFor, h.mapsAgainst], [1, 1, 3, 3]);
  assert.deepEqual(h.recent[0], { event: "W9", date: "2026-10-17", for: 1, against: 2, won: false });
  assert.equal(headToHeadRecent(ladder, "q"), null);
  assert.equal(eventsPlayed(ladder), 3);
  assert.equal(eventsPlayed(null), 0);
});
