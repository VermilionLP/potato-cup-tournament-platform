// Swiss-system tournament logic. Pure functions, no database access, so the
// rules can be unit tested on their own.
//
// Rules (agreed with the organisers):
// - A win is 1 point, a loss 0. Draws are not possible (results need a winner).
// - Ranking: points, then game differential (sum of score1 - score2 from the
//   player's side; walkovers and byes count 0), then Buchholz (sum of the
//   points of every real opponent faced), then seed.
// - Round 1 pairs the top half of the seeds against the bottom half (1 vs N/2+1).
// - Later rounds pair players in ranking order, skipping opponents they already
//   met. If that is impossible a rematch is allowed rather than stalling.
// - With an odd number of players the lowest-ranked player who has not had a
//   bye sits out and is credited with a win.
//
// Swiss matches are stored with bracket = 'sw' and round = the Swiss round
// number (1, 2, 3 ...). A bye is a completed match with only player1 set.

export const SWISS_BRACKET = 'sw';
export const MIN_SWISS_ROUNDS = 1;
export const MAX_SWISS_ROUNDS = 15;

/** Suggested number of rounds for `playerCount` players: ceil(log2 N). */
export function suggestedSwissRounds(playerCount) {
  const n = Number(playerCount) || 0;
  if (n < 2) return MIN_SWISS_ROUNDS;
  return Math.max(MIN_SWISS_ROUNDS, Math.ceil(Math.log2(n)));
}

/** Parses an admin-entered round count, or returns null when it is invalid. */
export function parseSwissRounds(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_SWISS_ROUNDS || n > MAX_SWISS_ROUNDS) return null;
  return n;
}

function isFinished(match) {
  return match.status === 'completed' || match.status === 'walkover';
}

export function isBye(match) {
  return Boolean(match.player1_id) !== Boolean(match.player2_id);
}

function pairKey(a, b) {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** Set of player pairs that already met (in any finished or scheduled match). */
export function playedPairs(matches) {
  const seen = new Set();
  for (const m of matches) {
    if (m.player1_id && m.player2_id) seen.add(pairKey(m.player1_id, m.player2_id));
  }
  return seen;
}

/**
 * Standings from the registered players and their Swiss matches.
 * `players`: [{ id, seed }]. Unfinished matches are ignored.
 * Returns rows sorted best first, each with a 1-based `rank`.
 */
export function computeStandings(players, matches) {
  const rows = new Map();
  for (const p of players) {
    rows.set(p.id, {
      player_id: p.id,
      seed: p.seed ?? Number.MAX_SAFE_INTEGER,
      wins: 0,
      losses: 0,
      points: 0,
      game_diff: 0,
      buchholz: 0,
      byes: 0,
      opponents: [],
    });
  }

  for (const m of matches) {
    if (!isFinished(m) || !m.winner_id) continue;
    if (isBye(m)) {
      const row = rows.get(m.winner_id);
      if (row) {
        row.wins += 1;
        row.points += 1;
        row.byes += 1;
      }
      continue;
    }
    const r1 = rows.get(m.player1_id);
    const r2 = rows.get(m.player2_id);
    const diff = m.status === 'completed' ? (Number(m.score1) || 0) - (Number(m.score2) || 0) : 0;
    if (r1) {
      r1.opponents.push(m.player2_id);
      r1.game_diff += diff;
    }
    if (r2) {
      r2.opponents.push(m.player1_id);
      r2.game_diff -= diff;
    }
    const winner = rows.get(m.winner_id);
    const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
    const loser = rows.get(loserId);
    if (winner) {
      winner.wins += 1;
      winner.points += 1;
    }
    if (loser) loser.losses += 1;
  }

  for (const row of rows.values()) {
    row.buchholz = row.opponents.reduce((sum, id) => sum + (rows.get(id)?.points ?? 0), 0);
  }

  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.game_diff - a.game_diff ||
      b.buchholz - a.buchholz ||
      a.seed - b.seed ||
      String(a.player_id).localeCompare(String(b.player_id)),
  );
  sorted.forEach((row, i) => {
    row.rank = i + 1;
  });
  return sorted;
}

// Pairs `ids` (already in priority order) without rematches. Exhaustive
// backtracking with a work cap; returns null when no rematch-free pairing is
// found.
function pairWithoutRematch(ids, played, budget = { steps: 200000 }) {
  if (ids.length === 0) return [];
  const [first, ...rest] = ids;
  for (let i = 0; i < rest.length; i += 1) {
    if (--budget.steps < 0) return null;
    const other = rest[i];
    if (played.has(pairKey(first, other))) continue;
    const remaining = rest.slice(0, i).concat(rest.slice(i + 1));
    const tail = pairWithoutRematch(remaining, played, budget);
    if (tail) return [[first, other], ...tail];
  }
  return null;
}

function pickBye(orderedIds, byeCounts) {
  for (let i = orderedIds.length - 1; i >= 0; i -= 1) {
    if (!byeCounts.get(orderedIds[i])) return orderedIds[i];
  }
  return orderedIds[orderedIds.length - 1];
}

/**
 * Pairings for `round` (1-based). `players`: [{ id, seed }]; `matches`: every
 * Swiss match of earlier rounds. Returns [{ player1_id, player2_id }] in board
 * order; a bye has player2_id = null and comes last.
 */
export function pairSwissRound(players, matches, round) {
  if (players.length < 2) throw new Error('瑞士轮至少需要 2 名选手');

  const pairs = [];
  let bye = null;

  if (round === 1) {
    const bySeed = [...players].sort(
      (a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || String(a.id).localeCompare(String(b.id)),
    );
    const ids = bySeed.map((p) => p.id);
    if (ids.length % 2 === 1) bye = ids.pop();
    const half = ids.length / 2;
    for (let i = 0; i < half; i += 1) pairs.push([ids[i], ids[i + half]]);
  } else {
    const standings = computeStandings(players, matches);
    const ordered = standings.map((r) => r.player_id);
    if (ordered.length % 2 === 1) {
      const byeCounts = new Map(standings.map((r) => [r.player_id, r.byes]));
      bye = pickBye(ordered, byeCounts);
      ordered.splice(ordered.indexOf(bye), 1);
    }
    const played = playedPairs(matches);
    const clean = pairWithoutRematch(ordered, played);
    if (clean) {
      pairs.push(...clean);
    } else {
      for (let i = 0; i < ordered.length; i += 2) pairs.push([ordered[i], ordered[i + 1]]);
    }
  }

  const result = pairs.map(([a, b]) => ({ player1_id: a, player2_id: b }));
  if (bye) result.push({ player1_id: bye, player2_id: null });
  return result;
}

/** Highest Swiss round that has matches, or 0. */
export function currentSwissRound(matches) {
  return matches.reduce((max, m) => (m.bracket === SWISS_BRACKET ? Math.max(max, m.round) : max), 0);
}

/** True when every match of `round` has a result. */
export function swissRoundComplete(matches, round) {
  const inRound = matches.filter((m) => m.bracket === SWISS_BRACKET && m.round === round);
  return inRound.length > 0 && inRound.every(isFinished);
}

/** Reason a Swiss tournament cannot start, or null. */
export function swissStartBlockedReason(playerCount, rounds) {
  const count = Number(playerCount) || 0;
  if (!parseSwissRounds(rounds)) return `请先设置瑞士轮轮数（${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS}）`;
  if (rounds > count - 1) {
    return `瑞士轮 ${rounds} 轮至少需要 ${rounds + 1} 名选手（当前 ${count} 人）`;
  }
  return null;
}
