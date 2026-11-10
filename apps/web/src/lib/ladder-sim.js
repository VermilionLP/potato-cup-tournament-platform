// "天梯分预估": how a match result would move both players' ladder MMR in the
// event's division (game mode + event type), with the same Elo rule as the
// server (apps/api/lib/ladder.js: expected score, K by games played; a
// match is one game whatever the map score). Uses the MMR and game count the
// event page already has (players[].ladder_mmr / ladder_games); unrated
// players start at 3000. An estimate: the server rates every game in time
// order, so results reported meanwhile can shift it a little.

import { ladderWeight } from "@potato-cup/shared/ladder-weight.js";

export { LADDER_WEIGHTS, ladderWeight } from "@potato-cup/shared/ladder-weight.js";

export const BASE_MMR = 3000;
export const PROVISIONAL_GAMES = 10;
const K_SCHEDULE = [
  { until: 10, k: 200 },
  { until: 30, k: 100 },
  { until: Infinity, k: 50 },
];

export function kForGames(games) {
  return (K_SCHEDULE.find((s) => games < s.until) || K_SCHEDULE[K_SCHEDULE.length - 1]).k;
}

export function expectedScore(rating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

const ratingOf = (p) => ({
  mmr: Number.isFinite(Number(p?.ladder_mmr)) && p?.ladder_mmr !== null ? Number(p.ladder_mmr) : BASE_MMR,
  games: Number(p?.ladder_games) || 0,
});

/**
 * Both outcomes for players a and b (event players with ladder fields), in
 * an event of kind `eventKind` (its ladder weight):
 * { a: { mmr, games, provisional }, b: {...}, ifAWins: { a, b }, ifBWins: { a, b } }
 * where each side is { after, delta } (rounded MMR).
 */
export function simulateMatch(playerA, playerB, { eventKind = null } = {}) {
  const a = ratingOf(playerA);
  const b = ratingOf(playerB);
  const ea = expectedScore(a.mmr, b.mmr);
  // The event's weight (major events move MMR more than weekly cups).
  const weight = ladderWeight(eventKind);
  const ka = kForGames(a.games) * weight;
  const kb = kForGames(b.games) * weight;
  const outcome = (aWon) => {
    const aAfter = a.mmr + ka * ((aWon ? 1 : 0) - ea);
    const bAfter = b.mmr + kb * ((aWon ? 0 : 1) - (1 - ea));
    return {
      a: { after: Math.round(aAfter), delta: Math.round(aAfter - a.mmr) },
      b: { after: Math.round(bAfter), delta: Math.round(bAfter - b.mmr) },
    };
  };
  const side = (r) => ({ ...r, provisional: r.games < PROVISIONAL_GAMES });
  return { a: side(a), b: side(b), winChanceA: ea, weight, ifAWins: outcome(true), ifBWins: outcome(false) };
}
