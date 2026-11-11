// 本场看点: a finished event's talking points, for its results page.
//   upset    the win with the biggest ladder gap against the winner (MMR
//            before the game, in the event's division)
//   closest  the match that went the most games, closest score, latest
//            round first (a final 3:2 beats a first-round 2:1)
//   darkHorse the player who finished furthest above their seed
// plus how many upsets there were. Pure: the route passes the rows.

const MIN_UPSET_GAP = 50;

/** How late in the event a match was: the grand final last; elimination
 * rounds count down to the final (round 1); Swiss rounds count up. */
export function lateness(m) {
  const round = Number(m.round) || 0;
  if (m.bracket === 'gf') return 1000 + round;
  if (m.bracket === 'sw') return round;
  // The third-place match (round 0) is played just before the final.
  return round === 0 ? 498.5 : 500 - round;
}
const MIN_SEED_GAIN = 2;

/**
 * matches: the event's decided matches; history: the ladder history rows of
 * this event's games (two per game: game_id, player_id, rating_before);
 * places: Map playerId -> { from, to } (eventPlacements); seeds: Map
 * playerId -> seed.
 */
export function buildHighlights({ matches = [], history = [], places = new Map(), seeds = new Map() }) {
  const before = new Map(); // `${game}:${player}` -> rating
  for (const h of history) before.set(`${h.game_id}:${h.player_id}`, h.rating_before);
  const played = matches.filter((m) => m.status === 'completed' && m.winner_id && m.player1_id && m.player2_id);

  let upset = null;
  let upsets = 0;
  for (const m of played) {
    const loser = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
    const w = before.get(`${m.id}:${m.winner_id}`);
    const l = before.get(`${m.id}:${loser}`);
    if (w == null || l == null) continue;
    const gap = Math.round(l - w);
    if (gap < MIN_UPSET_GAP) continue;
    upsets += 1;
    if (!upset || gap > upset.gap) {
      upset = { match_id: m.id, winner: m.winner_id, loser, winner_mmr: Math.round(w), loser_mmr: Math.round(l), gap, score1: m.score1, score2: m.score2 };
    }
  }

  const games = (m) => (Number(m.score1) || 0) + (Number(m.score2) || 0);
  const margin = (m) => Math.abs((Number(m.score1) || 0) - (Number(m.score2) || 0));
  // A different match from the upset when there is one, so the two say more.
  const close = [...played]
    .filter((m) => games(m) >= 2 && margin(m) === 1)
    .sort((a, b) => games(b) - games(a) || lateness(b) - lateness(a));
  const closest = close.find((m) => m.id !== upset?.match_id) || close[0];

  let darkHorse = null;
  for (const [id, place] of places) {
    const seed = Number(seeds.get(id));
    if (!seed || !place?.from) continue;
    const gain = seed - place.from;
    if (gain < MIN_SEED_GAIN) continue;
    if (!darkHorse || gain > darkHorse.gain || (gain === darkHorse.gain && place.from < darkHorse.place)) {
      darkHorse = { id, seed, place: place.from, place_to: place.to, gain };
    }
  }

  return {
    upset,
    upsets,
    closest: closest ? { match_id: closest.id, player1: closest.player1_id, player2: closest.player2_id, score1: closest.score1, score2: closest.score2, games: games(closest) } : null,
    darkHorse,
  };
}
