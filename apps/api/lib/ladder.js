// Ladder MMR for SUCK.
//
// Ratings are derived from *all completed tournament games* (classic loser-advances
// included) and computed on demand, so `matches` stays the single source of truth.
// The winner is always the player with the higher map score; `matches.winner_id` is
// the bracket advancer and must never be used here.

export const BASE_MMR = 3000;
export const ACTIVE_DAYS = 365;
export const PROVISIONAL_GAMES = 10;

// SC2 LotV league target: Master 4%, Diamond 23%, Platinum 23%,
// Gold 23%, Silver 23%, Bronze 4%. Grandmaster is a regional top-200 cut,
// not a percentage; a small local pool has no GM (we only add one at 200+).
export const LEAGUE_BANDS = Object.freeze([
  { group: "master", name: "大师", percent: 4 },
  { group: "diamond", name: "钻石", percent: 23 },
  { group: "platinum", name: "白金", percent: 23 },
  { group: "gold", name: "黄金", percent: 23 },
  { group: "silver", name: "白银", percent: 23 },
  { group: "bronze", name: "青铜", percent: 4 },
]);

export const UNRATED_TIER = Object.freeze({
  key: "unrated",
  group: "unrated",
  name: "未定级",
});

const SUB_TIER_LABELS = ["I", "II", "III"];

function subTierFor(index, count) {
  if (count <= 0) return 0;
  return Math.min(2, Math.floor((index * 3) / count));
}

/**
 * Assign LotV percentile tiers to an already sorted player list.
 * Ranks are 0-based internally; the top 4% is Master, etc.
 * Grandmaster is intentionally absent until the pool reaches 200 players.
 */
export function assignPercentileTiers(players = []) {
  const total = players.length;
  const result = players.map((player) => ({ ...player }));
  if (total === 0) return result;

  const hasGm = total >= 200;
  const base = hasGm ? 1 : 0;
  if (hasGm) {
    result[0].tier = { key: "grandmaster", group: "grandmaster", name: "宗师" };
  }

  const pool = total - base;
  let cursor = base;
  let cumulative = 0;
  for (const band of LEAGUE_BANDS) {
    cumulative += band.percent;
    const end = band.group === "bronze"
      ? total
      : Math.min(total, base + Math.round((pool * cumulative) / 100));
    const count = Math.max(0, end - cursor);
    for (let i = 0; i < count; i += 1) {
      const idx = cursor + i;
      const sub = subTierFor(i, count);
      result[idx].tier = {
        key: `${band.group}-${sub + 1}`,
        group: band.group,
        name: `${band.name} ${SUB_TIER_LABELS[sub]}`,
      };
    }
    cursor = end;
  }

  // Rounding can leave the very last players unassigned; make them Bronze III.
  for (; cursor < total; cursor += 1) {
    result[cursor].tier = { key: "bronze-3", group: "bronze", name: "青铜 III" };
  }
  return result;
}

// SC2-like provisional swing: ~±100 for an even game in the first 10, then ±50,
// then ±25 for established players (SC2 typically settles around 20-30).
export const K_SCHEDULE = Object.freeze([
  { until: 10, k: 200 },
  { until: 30, k: 100 },
  { until: Infinity, k: 50 },
]);

export function kForGames(games, schedule = K_SCHEDULE) {
  const step = schedule.find((s) => games < s.until);
  return (step || schedule[schedule.length - 1]).k;
}

export function expectedScore(rating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

function emptyState() {
  return {
    rating: BASE_MMR,
    games: 0,
    wins: 0,
    losses: 0,
    peak: BASE_MMR,
    last_game_at: null,
  };
}

function timestampOf(value) {
  if (!value) return 0;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Compute current MMR from chronologically ordered games.
 * Each game: { id, player1_id, player2_id, score1, score2, played_at, ... }
 * Returns { players, history }; players are already ranked.
 */
export function computeLadder(games = []) {
  const state = new Map();
  const history = [];

  const get = (id) => {
    if (!state.has(id)) state.set(id, emptyState());
    return state.get(id);
  };

  for (const game of games) {
    const p1 = game.player1_id;
    const p2 = game.player2_id;
    const score1 = Number(game.score1);
    const score2 = Number(game.score2);
    if (!p1 || !p2 || p1 === p2 || (!(score1 > score2) && !(score2 > score1))) {
      continue;
    }

    const a = get(p1);
    const b = get(p2);
    const aWon = score1 > score2;
    const ea = expectedScore(a.rating, b.rating);
    const ka = kForGames(a.games);
    const kb = kForGames(b.games);
    const aAfter = a.rating + ka * ((aWon ? 1 : 0) - ea);
    const bAfter = b.rating + kb * ((aWon ? 0 : 1) - (1 - ea));
    const playedAt = game.played_at || null;

    history.push(
      {
        game_id: game.id,
        tournament_id: game.tournament_id,
        player_id: p1,
        opponent_id: p2,
        won: aWon,
        score1,
        score2,
        score_for: score1,
        score_against: score2,
        rating_before: a.rating,
        rating_after: aAfter,
        opponent_rating_before: b.rating,
        opponent_rating_after: bAfter,
        delta: aAfter - a.rating,
        played_at: playedAt,
      },
      {
        game_id: game.id,
        tournament_id: game.tournament_id,
        player_id: p2,
        opponent_id: p1,
        won: !aWon,
        score1,
        score2,
        score_for: score2,
        score_against: score1,
        rating_before: b.rating,
        rating_after: bAfter,
        opponent_rating_before: a.rating,
        opponent_rating_after: aAfter,
        delta: bAfter - b.rating,
        played_at: playedAt,
      }
    );

    a.rating = aAfter;
    a.games += 1;
    a.wins += aWon ? 1 : 0;
    a.losses += aWon ? 0 : 1;
    a.peak = Math.max(a.peak, aAfter);
    a.last_game_at = playedAt;

    b.rating = bAfter;
    b.games += 1;
    b.wins += aWon ? 0 : 1;
    b.losses += aWon ? 1 : 0;
    b.peak = Math.max(b.peak, bAfter);
    b.last_game_at = playedAt;
  }

  const players = [...state.entries()].map(([id, s]) => ({
    id,
    rating: s.rating,
    mmr: Math.round(s.rating),
    games: s.games,
    wins: s.wins,
    losses: s.losses,
    win_rate: s.games ? s.wins / s.games : 0,
    peak_mmr: Math.round(s.peak),
    last_game_at: s.last_game_at,
    provisional: s.games < PROVISIONAL_GAMES,
  }));

  players.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.games !== a.games) return b.games - a.games;
    const at = timestampOf(a.last_game_at);
    const bt = timestampOf(b.last_game_at);
    if (bt !== at) return bt - at;
    return String(a.id).localeCompare(String(b.id));
  });
  players.forEach((p, index) => {
    p.rank = index + 1;
  });
  const tiered = assignPercentileTiers(players);

  return { players: tiered, history };
}

/**
 * Seed order: rated players by MMR (provisional included), then unrated players by
 * registration time. `registered_at` is only a tiebreaker.
 */
export function sortForSeeds(players = []) {
  return [...players].sort((a, b) => {
    const aRated = (a.games || 0) > 0;
    const bRated = (b.games || 0) > 0;
    if (aRated !== bRated) return aRated ? -1 : 1;
    if (a.rating !== b.rating) return b.rating - a.rating;
    if ((a.games || 0) !== (b.games || 0)) return (b.games || 0) - (a.games || 0);
    const at = timestampOf(a.last_game_at);
    const bt = timestampOf(b.last_game_at);
    if (at !== bt) return bt - at;
    const ar = timestampOf(a.registered_at);
    const br = timestampOf(b.registered_at);
    if (ar !== br) return ar - br;
    return String(a.id).localeCompare(String(b.id));
  });
}

function jitterSortInPlace(list, jitter, rng) {
  const keyed = list.map((player, index) => ({
    player,
    index,
    key: (player.rating || 0) + (rng() * 2 - 1) * jitter,
  }));
  keyed.sort((a, b) => b.key - a.key || a.index - b.index);
  list.splice(0, list.length, ...keyed.map((item) => item.player));
}

/**
 * Randomly jitter players whose MMR is within a bounded band, keeping the top and
 * bottom `keepTop`/`keepBottom` positions fixed. A small rating jitter is used
 * instead of a full shuffle, so nearby players can trade places while the list
 * stays roughly ordered. Large rating gaps (and all unrated players) stay put.
 */
export function randomizeSeedOrder(
  players = [],
  { band = 80, keepTop = 2, keepBottom = 2, maxGroup = 4, rng = Math.random } = {}
) {
  const ordered = sortForSeeds(players);
  const rated = ordered.filter((p) => (p.games || 0) > 0);
  const unrated = ordered.filter((p) => !(p.games || 0));

  const groups = [];
  let current = [];
  for (const player of rated) {
    if (
      current.length > 0 &&
      (current.length >= maxGroup ||
        current[0].rating - player.rating > band)
    ) {
      groups.push(current);
      current = [];
    }
    current.push(player);
  }
  if (current.length > 0) groups.push(current);

  const total = ordered.length;
  const groupsWithUnrated = [...groups];
  if (unrated.length > 0) groupsWithUnrated.push(unrated);

  const result = [];
  let index = 0;
  for (const group of groupsWithUnrated) {
    const start = index;
    const end = index + group.length;
    // Keep the guards fixed; a group that straddles a guard is only partly shuffled.
    const from = Math.max(start, keepTop);
    const to = Math.min(end, total - keepBottom);
    if (to - from > 1) {
      const slice = group.slice(from - start, to - start);
      // Jitter the rating slightly instead of a full shuffle: nearby players can
      // trade places, but the list stays roughly ordered (no 3000 jumping above 3100).
      jitterSortInPlace(slice, band / 4, rng);
      group.splice(from - start, slice.length, ...slice);
    }
    result.push(...group);
    index = end;
  }
  return result;
}

/**
 * A ladder division: game mode (ab / rb / sb) and/or event type (prop /
 * legacy-jet / top-jet / proleague). Empty = all. Each division is rated on its own
 * games from scratch, e.g. { mode: 'ab', pool: 'prop' } = AB 螺旋桨.
 */
export function filterGamesByDivision(games = [], { mode = '', pool = '' } = {}) {
  if (!mode && !pool) return games;
  return games.filter((g) => (!mode || (g.game_mode || 'rb') === mode) && (!pool || g.vehicle_pool === pool));
}
