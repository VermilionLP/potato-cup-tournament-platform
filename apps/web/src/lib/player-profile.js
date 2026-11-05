// The player page (/player/[id]): records per event type and game mode,
// opponents and head-to-head from the ladder history, points per board.
// Pure; the page fetches /players/:id, /players/statistics,
// /ladder/players/:id and /points-leaderboard.

import { GAME_MODES, VEHICLE_POOLS } from "./tournament.js";

const rate = (won, lost) => (won + lost ? won / (won + lost) : 0);

/** Rows of a record map (stats.pools / stats.modes) with names, played ones first. */
export function recordRows(records = {}, catalogue = VEHICLE_POOLS) {
  return catalogue
    .map((c) => {
      const r = records[c.id] || {};
      const won = r.matches_won || 0;
      const lost = r.matches_lost || 0;
      return { id: c.id, name: c.name, code: c.code, tournaments: r.tournaments || 0, won, lost, rate: rate(won, lost) };
    })
    .filter((r) => r.tournaments || r.won || r.lost)
    .sort((a, b) => b.won + b.lost - (a.won + a.lost) || b.tournaments - a.tournaments);
}

export const poolRows = (pools) => recordRows(pools, VEHICLE_POOLS);
export const modeRows = (modes) => recordRows(modes, GAME_MODES);

/** Opponents met in rated games (ladder history), most games first. */
export function opponentsOf(history = []) {
  const map = new Map();
  for (const h of history) {
    const o = map.get(h.opponent_id) || { id: h.opponent_id, name: h.opponent_name || h.opponent_id, won: 0, lost: 0 };
    if (h.won) o.won += 1;
    else o.lost += 1;
    map.set(h.opponent_id, o);
  }
  return [...map.values()].sort((a, b) => b.won + b.lost - (a.won + a.lost) || a.name.localeCompare(b.name));
}

/** Head-to-head against one opponent: totals and the games, newest first. */
export function headToHead(history = [], opponentId) {
  const games = history.filter((h) => h.opponent_id === opponentId);
  const won = games.filter((h) => h.won).length;
  const mapsFor = games.reduce((n, h) => n + (Number(h.score_for) || 0), 0);
  const mapsAgainst = games.reduce((n, h) => n + (Number(h.score_against) || 0), 0);
  return { games, won, lost: games.length - won, mapsFor, mapsAgainst, rate: rate(won, games.length - won) };
}

/** This season's points per board: [{ pool, name, rank, total, events, of }]. */
export function pointsRows(boards = [], playerId) {
  return boards
    .map((b) => {
      const row = (b.players || []).find((p) => p.id === playerId);
      if (!row) return null;
      const name = VEHICLE_POOLS.find((p) => p.id === b.pool)?.name || b.pool;
      return { pool: b.pool, name, rank: row.rank, total: row.total, events: row.events, of: b.players.length };
    })
    .filter(Boolean);
}

/** Events the player took part in, newest first (statistics' tournaments). */
export function eventRows(tournaments = []) {
  return [...tournaments].reverse();
}

/** The last `n` ladder games, newest first: [{ won, opponent, score, event, id }]. */
export function recentForm(history = [], n = 5) {
  return history.slice(0, n).map((h) => ({
    id: h.game_id ?? `${h.tournament_id}-${h.opponent_id}-${h.played_at}`,
    won: Boolean(h.won),
    opponent: h.opponent_name || h.opponent_id,
    score: `${h.score_for ?? "?"} : ${h.score_against ?? "?"}`,
    event: h.tournament_name || "",
  }));
}

/**
 * Sparkline of the last `n` games' MMR (oldest first, starting from the MMR
 * before the first of them), as SVG points in a `width` × `height` box.
 * Returns { points, min, max, up } or null with fewer than 2 values.
 */
export function mmrSparkline(history = [], { n = 30, width = 160, height = 40 } = {}) {
  const games = history.slice(0, n).reverse();
  if (!games.length) return null;
  const values = [games[0].mmr_before ?? games[0].mmr_after, ...games.map((h) => h.mmr_after)].filter(Number.isFinite);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return { points, min, max, up: values.at(-1) >= values[0] };
}
