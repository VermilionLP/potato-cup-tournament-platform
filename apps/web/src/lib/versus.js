// The overlay's matchup preview (components/overlay/MatchupScene.svelte): what it
// shows of each player, from their ladder page data (/ladder/players/:id)
// and the event's matches. Pure.

import { headToHead, recentForm } from "./player-profile.js";

/** Wins and losses of `playerId` in this event's decided matches. */
export function eventRecord(matches = [], playerId) {
  let won = 0;
  let lost = 0;
  for (const m of matches) {
    if (!playerId || (m.status !== "completed" && m.status !== "walkover")) continue;
    if (m.player1_id !== playerId && m.player2_id !== playerId) continue;
    if (!m.winner_id) continue;
    if (m.winner_id === playerId) won += 1;
    else lost += 1;
  }
  return { won, lost };
}

/**
 * One side of the card: { mmr, tier, games, winRate, form, event } with
 * ladder = /ladder/players/:id (null for a player without rated games).
 */
export function versusSide(ladder, matches, playerId) {
  return {
    mmr: ladder?.mmr ?? null,
    tier: ladder?.tier || null,
    games: ladder?.games || 0,
    winRate: ladder?.win_rate ?? null,
    form: recentForm(ladder?.history || [], 5),
    event: eventRecord(matches, playerId),
  };
}

/**
 * Their meetings, from player 1's history: { won, lost, last } or null;
 * last = the newest meeting { event, score (winner first), won (by player 1) }.
 */
export function meetings(ladder1, opponentId) {
  if (!ladder1?.history?.length || !opponentId) return null;
  const h = headToHead(ladder1.history, opponentId);
  if (!h.games.length) return null;
  const g = h.games[0];
  const hi = Math.max(Number(g.score_for) || 0, Number(g.score_against) || 0);
  const lo = Math.min(Number(g.score_for) || 0, Number(g.score_against) || 0);
  return { won: h.won, lost: h.lost, last: { event: g.tournament_name || "", score: `${hi} : ${lo}`, won: Boolean(g.won) } };
}

/**
 * Head to head for the matchup preview, from player 1's history (newest
 * first): { won, lost, mapsFor, mapsAgainst, recent: [{ event, date, for,
 * against, won }] } with the last `n` meetings; null when they never met.
 */
export function headToHeadRecent(ladder1, opponentId, n = 5) {
  if (!ladder1?.history?.length || !opponentId) return null;
  const h = headToHead(ladder1.history, opponentId);
  if (!h.games.length) return null;
  return {
    won: h.won,
    lost: h.lost,
    mapsFor: h.mapsFor,
    mapsAgainst: h.mapsAgainst,
    recent: h.games.slice(0, n).map((g) => ({
      event: g.tournament_name || "",
      date: String(g.played_at || "").slice(0, 10),
      for: Number(g.score_for) || 0,
      against: Number(g.score_against) || 0,
      won: Boolean(g.won),
    })),
  };
}

/** Events a player has ladder games in (their history's tournaments). */
export function eventsPlayed(ladder) {
  return new Set((ladder?.history || []).map((h) => h.tournament_id).filter(Boolean)).size;
}
