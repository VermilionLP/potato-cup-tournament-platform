import assert from "node:assert/strict";
import { test } from "node:test";
import { MatchRepo } from "../repositories/match-repo.js";
import { resolveDoubleElimRows } from "../lib/double-elim.js";

// Minimal in-memory stand-in for the handful of queries the advancement code
// runs. It keeps the real repository logic under test without PostgreSQL.
function fakeDb(rows, tournament) {
  const matches = new Map(rows.map((row) => [row.id, { ...row }]));
  let nextId = Math.max(0, ...matches.keys()) + 1;

  function query(sql, params = []) {
    const text = sql.replace(/\s+/g, " ").trim();

    if (text.startsWith("SELECT * FROM axsuck.matches WHERE id = $1")) {
      const row = matches.get(params[0]);
      return { rows: row ? [row] : [] };
    }
    if (text.startsWith("SELECT loser_advances, format FROM axsuck.tournaments")) {
      return { rows: [tournament] };
    }
    if (text.startsWith("SELECT format, playoff_format, grand_final_reset FROM axsuck.tournaments")) {
      return { rows: [tournament] };
    }
    if (
      text.startsWith(
        "UPDATE axsuck.matches SET score1 = $1, score2 = $2, winner_id = $3, status = 'completed'",
      )
    ) {
      const row = matches.get(params[3]);
      Object.assign(row, {
        score1: params[0],
        score2: params[1],
        winner_id: params[2],
        status: "completed",
      });
      return { rows: [row] };
    }
    if (
      text.startsWith(
        "UPDATE axsuck.matches SET player1_id = $1, slot1_void = $2",
      )
    ) {
      const row = matches.get(params[2]);
      Object.assign(row, { player1_id: params[0], slot1_void: params[1] });
      return { rows: [row] };
    }
    if (
      text.startsWith(
        "UPDATE axsuck.matches SET player2_id = $1, slot2_void = $2",
      )
    ) {
      const row = matches.get(params[2]);
      Object.assign(row, { player2_id: params[0], slot2_void: params[1] });
      return { rows: [row] };
    }
    if (
      text.startsWith(
        "UPDATE axsuck.matches SET status = 'completed', winner_id = $1, score1 = 0, score2 = 0",
      )
    ) {
      const row = matches.get(params[1]);
      Object.assign(row, {
        status: "completed",
        winner_id: params[0],
        score1: 0,
        score2: 0,
      });
      return { rows: [row] };
    }
    if (
      text.startsWith(
        "SELECT * FROM axsuck.matches WHERE tournament_id = $1 AND bracket = 'gf' AND position = 2",
      )
    ) {
      const found = [...matches.values()].filter(
        (row) =>
          row.tournament_id === params[0] &&
          row.bracket === "gf" &&
          row.position === 2,
      );
      return { rows: found, rowCount: found.length };
    }
    if (text.startsWith("DELETE FROM axsuck.matches WHERE id = $1")) {
      const existed = matches.delete(params[0]);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }
    if (
      text.startsWith(
        "INSERT INTO axsuck.matches (tournament_id, round, position, bracket, player1_id, player2_id, status)",
      )
    ) {
      const row = {
        id: nextId++,
        tournament_id: params[0],
        round: 1,
        position: 2,
        bracket: "gf",
        player1_id: params[1],
        player2_id: params[2],
        score1: 0,
        score2: 0,
        winner_id: null,
        status: "pending",
        next_match_id: null,
        next_slot: null,
        loser_next_match_id: null,
        loser_next_slot: null,
        slot1_void: false,
        slot2_void: false,
      };
      matches.set(row.id, row);
      return { rows: [row] };
    }
    if (
      text.startsWith(
        "UPDATE axsuck.matches SET player1_id = $1, player2_id = $2, score1 = 0, score2 = 0, winner_id = NULL, status = 'pending'",
      )
    ) {
      const row = matches.get(params[2]);
      Object.assign(row, {
        player1_id: params[0],
        player2_id: params[1],
        score1: 0,
        score2: 0,
        winner_id: null,
        status: "pending",
      });
      return { rows: [row] };
    }

    throw new Error(`unhandled SQL in fake db: ${text}`);
  }

  return { query, matches };
}

function rowsFor(players, tournamentId = "t1") {
  const plan = resolveDoubleElimRows(players);
  const idByKey = new Map(plan.map((row, index) => [row.key, index + 1]));
  return plan.map((row) => ({
    id: idByKey.get(row.key),
    tournament_id: tournamentId,
    round: row.round,
    position: row.position,
    bracket: row.bracket,
    player1_id: row.player1_id,
    player2_id: row.player2_id,
    score1: 0,
    score2: 0,
    winner_id: row.winner_id,
    status: row.status,
    next_match_id: row.next_key ? idByKey.get(row.next_key) : null,
    next_slot: row.next_slot ?? null,
    loser_next_match_id: row.loser_next_key
      ? idByKey.get(row.loser_next_key)
      : null,
    loser_next_slot: row.loser_next_slot ?? null,
    slot1_void: row.slot1_void,
    slot2_void: row.slot2_void,
  }));
}

const doubleTournament = {
  loser_advances: 1,
  format: "double_elim",
  grand_final_reset: true,
};

test("a winners-bracket result feeds the next winners match and the losers bracket", async () => {
  const rows = rowsFor(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
  const db = fakeDb(rows, doubleTournament);
  const repo = MatchRepo(db);

  const first = rows.find(
    (row) => row.bracket === "wb" && row.round === 3 && row.position === 1,
  );
  const updated = await repo.submitResult(first.id, 2, 1);
  assert.equal(updated.winner_id, "P1", "the higher score wins in double elim");

  await repo.advanceWinner("t1", first.id);

  const nextWb = db.matches.get(first.next_match_id);
  assert.equal(nextWb.player1_id, "P1");

  const losersEntry = db.matches.get(first.loser_next_match_id);
  assert.equal(losersEntry.player1_id, "P8");
});

test("a bye in the losers bracket auto-advances the waiting player", async () => {
  const rows = rowsFor(["P1", "P2", "P3", "P4", "P5", "P6"]);
  const db = fakeDb(rows, doubleTournament);
  const repo = MatchRepo(db);

  const realFirstRound = rows.find(
    (row) => row.bracket === "wb" && row.round === 3 && row.position === 2,
  );
  assert.equal(realFirstRound.player1_id, "P4");
  assert.equal(realFirstRound.player2_id, "P5");

  await repo.submitResult(realFirstRound.id, 1, 0);
  await repo.advanceWinner("t1", realFirstRound.id);

  const lbEntry = db.matches.get(realFirstRound.loser_next_match_id);
  assert.equal(
    lbEntry.status,
    "completed",
    "one-sided losers match is a walkover",
  );
  assert.equal(lbEntry.winner_id, "P5");

  const lbNext = db.matches.get(lbEntry.next_match_id);
  assert.equal(lbNext.player2_id, "P5");
});

test("the grand final creates a reset match when the losers champion wins", async () => {
  const gf = {
    id: 1,
    tournament_id: "t1",
    round: 1,
    position: 1,
    bracket: "gf",
    player1_id: "WB",
    player2_id: "LB",
    score1: 0,
    score2: 0,
    winner_id: "LB",
    status: "completed",
    next_match_id: null,
    next_slot: null,
    loser_next_match_id: null,
    loser_next_slot: null,
    slot1_void: false,
    slot2_void: false,
  };
  const db = fakeDb([gf], doubleTournament);
  const repo = MatchRepo(db);

  await repo.advanceWinner("t1", 1);

  const reset = [...db.matches.values()].find(
    (row) => row.bracket === "gf" && row.position === 2,
  );
  assert.ok(reset, "a reset final is created");
  assert.equal(reset.player1_id, "WB");
  assert.equal(reset.player2_id, "LB");
  assert.equal(reset.status, "pending");
});

test("a winners champion closing the final removes a leftover reset match", async () => {
  const gf = {
    id: 1,
    tournament_id: "t1",
    round: 1,
    position: 1,
    bracket: "gf",
    player1_id: "WB",
    player2_id: "LB",
    score1: 0,
    score2: 0,
    winner_id: "WB",
    status: "completed",
    next_match_id: null,
    next_slot: null,
    loser_next_match_id: null,
    loser_next_slot: null,
    slot1_void: false,
    slot2_void: false,
  };
  const reset = {
    ...gf,
    id: 2,
    position: 2,
    winner_id: "LB",
    status: "completed",
  };
  const db = fakeDb([gf, reset], doubleTournament);
  const repo = MatchRepo(db);

  await repo.advanceWinner("t1", 1);

  assert.equal(
    [...db.matches.values()].some(
      (row) => row.bracket === "gf" && row.position === 2,
    ),
    false,
  );
});
