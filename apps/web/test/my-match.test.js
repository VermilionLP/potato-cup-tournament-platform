import { test } from "node:test";
import assert from "node:assert/strict";
import { myMatchInfo, nextMatchOf, reportView } from "../src/lib/my-match.js";

const players = ["a", "b", "c", "d"].map((id) => ({ id, display_name: id.toUpperCase(), battle_tags: { qq: "1" } }));
const m = (o) => ({ id: 1, bracket: "main", round: 2, position: 1, player1_id: "a", player2_id: "b", status: "pending", winner_id: null, pending_report: null, ...o });
const event = (o) => ({ status: "in_progress", players, matches: [], ...o });

test("registration: check-in states", () => {
  assert.equal(myMatchInfo(event({ status: "registration" }), "a").state, "registered");
  const t = (open, checked) => event({ status: "registration", checkin: { enabled: true, open }, players: players.map((p) => (p.id === "a" ? { ...p, checked_in_at: checked } : p)) });
  assert.equal(myMatchInfo(t(false, null), "a").state, "checkin-soon");
  assert.equal(myMatchInfo(t(true, null), "a").state, "checkin");
  assert.equal(myMatchInfo(t(true, "2026-11-02T12:00:00Z"), "a").state, "checked-in");
  assert.equal(myMatchInfo(t(true, null), "zz"), null, "not registered");
  assert.equal(myMatchInfo(event({ status: "completed" }), "a"), null);
});

test("the next match: playable first, in match order", () => {
  const ms = [m({ id: 5, player2_id: null }), m({ id: 9, player2_id: "c" }), m({ id: 7, player2_id: "d" })];
  assert.equal(nextMatchOf(ms, "a").id, 7);
  assert.equal(nextMatchOf(ms, "a", new Map([[9, 1], [7, 2]])).id, 9);
  assert.equal(nextMatchOf([m({ player2_id: null })], "a").player2_id, null);
});

test("play, waiting, idle and out", () => {
  const info = myMatchInfo(event({ matches: [m({})] }), "b");
  assert.equal(info.state, "play");
  assert.equal(info.opponent.display_name, "A");
  assert.equal(myMatchInfo(event({ matches: [m({ player2_id: null })] }), "a").state, "waiting");
  assert.equal(myMatchInfo(event({ matches: [m({ status: "completed", winner_id: "a" })] }), "a").state, "idle");
  assert.equal(myMatchInfo(event({ matches: [m({ status: "completed", winner_id: "a" })] }), "b").state, "out");
  assert.equal(myMatchInfo(event({ matches: [m({ bracket: "sw", status: "completed", winner_id: "a" })] }), "b").state, "idle", "Swiss: never out");
  assert.equal(myMatchInfo(event({ matches: [m({ bracket: "wb", status: "completed", winner_id: "a" })] }), "b").state, "idle", "winners bracket loss: losers bracket next");
  assert.equal(myMatchInfo(event({ players: players.map((p) => (p.id === "a" ? { ...p, forfeited: true } : p)) }), "a").state, "forfeited");
});

test("reports from each side", () => {
  const r = { kind: "score", by: "a", score1: 2, score2: 1, disputed: false, counter: null };
  assert.equal(myMatchInfo(event({ matches: [m({ pending_report: r })] }), "a").state, "reported");
  const theirs = myMatchInfo(event({ matches: [m({ pending_report: r })] }), "b");
  assert.equal(theirs.state, "confirm");
  assert.deepEqual([theirs.report.myScore, theirs.report.theirScore], [1, 2], "scores from b's side");
  assert.equal(myMatchInfo(event({ matches: [m({ pending_report: { ...r, disputed: true } })] }), "b").state, "disputed");
  const claim = { kind: "walkover", by: "a", winner_id: "a", disputed: false };
  assert.equal(myMatchInfo(event({ matches: [m({ pending_report: claim })] }), "a").state, "claim");
  assert.equal(myMatchInfo(event({ matches: [m({ pending_report: claim })] }), "b").state, "claimed");
  assert.equal(reportView(m({}), "a"), null);
});
