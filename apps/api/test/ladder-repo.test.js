import assert from "node:assert/strict";
import { test } from "node:test";
import { LadderRepo } from "../repositories/ladder-repo.js";

function makeDb({ games, players, registrations, event = { game_mode: "rb", vehicle_pool: "prop" } }) {
  const seedWrites = [];
  const modeWrites = [];

  function route(sql, params) {
    const text = String(sql).trim();
    if (text.startsWith("SELECT") && text.includes("FROM axsuck.matches m")) {
      return { rows: games };
    }
    if (text.startsWith("SELECT id, flag, team FROM axsuck.players")) {
      return { rows: players };
    }
    if (text.startsWith("SELECT") && text.includes("FROM axsuck.tournament_players tp")) {
      return { rows: registrations };
    }
    if (text.startsWith("SELECT game_mode, vehicle_pool FROM axsuck.tournaments")) {
      return { rows: [event] };
    }
    if (text.startsWith("UPDATE axsuck.tournament_players SET seed = NULL")) {
      return { rows: [] };
    }
    if (text.startsWith("UPDATE axsuck.tournament_players SET seed = $1")) {
      seedWrites.push(params);
      return { rows: [] };
    }
    if (text.startsWith("UPDATE axsuck.tournaments SET seed_mode")) {
      modeWrites.push(params);
      return { rows: [] };
    }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) {
      return { rows: [] };
    }
    throw new Error(`unexpected SQL: ${text}`);
  }

  const client = {
    query: async (sql, params) => route(sql, params),
    release() {},
  };
  const db = {
    query: async (sql, params) => route(sql, params),
    connect: async () => client,
  };
  return { db, seedWrites, modeWrites };
}

const games = [
  {
    id: 1,
    tournament_id: "t1",
    player1_id: "p1",
    player2_id: "p2",
    score1: 2,
    score2: 0,
    played_at: "2026-01-10T20:00:00+08:00",
  },
  {
    id: 2,
    tournament_id: "t1",
    player1_id: "p1",
    player2_id: "p3",
    score1: 2,
    score2: 1,
    played_at: "2026-01-10T20:30:00+08:00",
  },
  {
    id: 3,
    tournament_id: "t1",
    player1_id: "p2",
    player2_id: "p3",
    score1: 2,
    score2: 1,
    played_at: "2026-01-10T21:00:00+08:00",
  },
];

const players = [
  { id: "p1", flag: "cn", team: "A" },
  { id: "p2", flag: "cn", team: "B" },
  { id: "p3", flag: "kr", team: "" },
  { id: "p4", flag: "cn", team: "" },
];

const registrations = [
  { id: "p3", seed: 3, registered_at: "2026-01-03", flag: "kr", team: "" },
  { id: "p1", seed: 1, registered_at: "2026-01-01", flag: "cn", team: "A" },
  { id: "p4", seed: 4, registered_at: "2026-01-04", flag: "cn", team: "" },
  { id: "p2", seed: 2, registered_at: "2026-01-02", flag: "cn", team: "B" },
];

test("leaderboard ranks players by computed MMR", async () => {
  const { db } = makeDb({ games, players, registrations });
  const rows = await LadderRepo(db).leaderboard();
  assert.deepEqual(rows.map((p) => p.id), ["p1", "p2", "p3"]);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].tier.name, "钻石 I");
  assert.equal(rows[0].display_name, "p1");
  assert.equal(rows[0].team, "A");
});

test("player detail exposes per-player score perspective", async () => {
  const { db } = makeDb({ games, players, registrations });
  const detail = await LadderRepo(db).playerDetail("p2");
  assert.equal(detail.id, "p2");
  assert.equal(detail.history.length, 2);
  const loss = detail.history.find((h) => h.game_id === 1);
  assert.equal(loss.won, false);
  assert.equal(loss.score_for, 0);
  assert.equal(loss.score_against, 2);
  assert.equal(loss.opponent_mmr, 3000);
  const win = detail.history.find((h) => h.game_id === 3);
  assert.equal(win.won, true);
  assert.equal(win.score_for, 2);
  assert.equal(win.opponent_name, "p3");
  assert.equal(win.opponent_mmr, 2928);
});

test("leaderboard hides inactive players unless includeInactive is set", async () => {
  const { db } = makeDb({ games, players, registrations });
  const repo = LadderRepo(db);
  const active = await repo.leaderboard({ activeDays: 1 });
  assert.equal(active.length, 0);

  const all = await repo.leaderboard({ activeDays: 1, includeInactive: true });
  assert.equal(all.length, 3);
  assert.ok(all.every((p) => p.active === false));
});

test("player detail reports whether the player is still active", async () => {
  const { db } = makeDb({ games, players, registrations });
  const repo = LadderRepo(db);
  const fresh = await repo.playerDetail("p1");
  assert.equal(fresh.active, true);
  const stale = await repo.playerDetail("p1", { activeDays: 1 });
  assert.equal(stale.active, false);
});

test("suggestSeeds puts rated players first, unrated last", async () => {
  const { db } = makeDb({ games, players, registrations });
  const order = await LadderRepo(db).suggestSeeds("t1");
  assert.deepEqual(order.map((p) => p.id), ["p1", "p2", "p3", "p4"]);
  assert.equal(order[0].seed, 1);
  assert.equal(order[3].seed, 4);
  assert.equal(order[3].games, 0);
  assert.equal(order[3].tier.name, "未定级");
});

test("autoSeeds writes 1..N seeds and switches the tournament to auto", async () => {
  const { db, seedWrites, modeWrites } = makeDb({ games, players, registrations });
  const order = await LadderRepo(db).autoSeeds("t1");
  assert.deepEqual(order.map((p) => p.id), ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(seedWrites, [
    [1, "t1", "p1"],
    [2, "t1", "p2"],
    [3, "t1", "p3"],
    [4, "t1", "p4"],
  ]);
  assert.deepEqual(modeWrites, [["auto", "t1"]]);
});

test("divisions are rated on their own games; seeds use only the event's division", async () => {
  // p1 beats everyone in RB prop; p3 beats p1 twice in AB jets.
  const division = [
    { id: 11, tournament_id: "a", player1_id: "p1", player2_id: "p2", score1: 2, score2: 0, game_mode: "rb", vehicle_pool: "prop", played_at: "2026-01-01T20:00:00Z" },
    { id: 12, tournament_id: "a", player1_id: "p1", player2_id: "p3", score1: 2, score2: 0, game_mode: "rb", vehicle_pool: "prop", played_at: "2026-01-01T21:00:00Z" },
    { id: 13, tournament_id: "b", player1_id: "p3", player2_id: "p1", score1: 2, score2: 0, game_mode: "ab", vehicle_pool: "legacy-jet", played_at: "2026-01-02T20:00:00Z" },
    { id: 14, tournament_id: "b", player1_id: "p3", player2_id: "p1", score1: 2, score2: 0, game_mode: "ab", vehicle_pool: "legacy-jet", played_at: "2026-01-02T21:00:00Z" },
    { id: 15, tournament_id: "b", player1_id: "p3", player2_id: "p4", score1: 2, score2: 0, game_mode: "ab", vehicle_pool: "legacy-jet", played_at: "2026-01-02T22:00:00Z" },
  ];
  const regs = ["p1", "p3", "p4"].map((id) => ({ id, seed: null, registered_at: "2026-01-03T00:00:00Z", flag: "cn", team: "" }));
  const ab = makeDb({ games: division, players, registrations: regs, event: { game_mode: "ab", vehicle_pool: "legacy-jet" } });
  const abBoard = await LadderRepo(ab.db).leaderboard({ includeInactive: true, mode: "ab", pool: "legacy-jet" });
  assert.deepEqual(Object.fromEntries(abBoard.map((p) => [p.id, p.games])), { p3: 3, p1: 2, p4: 1 });
  assert.equal(abBoard[0].id, "p3");
  assert.equal(abBoard.find((p) => p.id === "p2"), undefined, "p2 has no AB Legacy Jet games");
  const rbBoard = await LadderRepo(ab.db).leaderboard({ includeInactive: true, mode: "rb", pool: "prop" });
  assert.equal(rbBoard[0].id, "p1");
  assert.deepEqual((await LadderRepo(ab.db).leaderboard({ includeInactive: true, pool: "prop" })).map((p) => p.id).sort(), ["p1", "p2", "p3"]);

  // AB Legacy Jet event: p3 first (division MMR).
  assert.equal((await LadderRepo(ab.db).suggestSeeds("b2"))[0].id, "p3");
  // RB prop event: p1 first; p4 has no RB prop games, so it is unrated and last.
  const rb = makeDb({ games: division, players, registrations: regs, event: { game_mode: "rb", vehicle_pool: "prop" } });
  const rbSeeds = await LadderRepo(rb.db).suggestSeeds("a2");
  assert.deepEqual(rbSeeds.map((p) => [p.id, p.games]), [["p1", 2], ["p3", 1], ["p4", 0]]);
});
