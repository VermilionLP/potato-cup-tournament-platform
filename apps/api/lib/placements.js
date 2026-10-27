// Final placings of finished events, for the statistics page (best result
// and the placing next to every event a player entered). Pure functions.
//
// Elimination brackets: champion, runner-up, then the third-place match and
// each earlier round (double elimination: each losers-bracket round from the
// final backwards); a tier gets the places it actually covers. Single-stage
// Swiss: the standings order. Two-stage events: playoff placings first, then
// everyone knocked out in the groups by group placing (all group 3rds share
// the next places, then all 4ths...), as Liquipedia prize pools do.
// Mirrors apps/web/src/lib/standings.js.

import { computeStandings, SWISS_BRACKET } from './swiss.js';
import { tournamentChampion } from './champions.js';
import { groupStageOf } from './group-stage-view.js';

const GROUP_STAGE = new Set([SWISS_BRACKET, 'gse', 'gwb', 'glb']);
const isDecided = (m) =>
  (m.status === 'completed' || m.status === 'walkover') && Boolean(m.winner_id && m.player1_id && m.player2_id);
const loserOf = (m) => (m.winner_id === m.player1_id ? m.player2_id : m.player1_id);
const ascending = (values) => [...new Set(values)].sort((a, b) => a - b);

function eliminationTiers(matches, doubleElim, champion) {
  const decided = matches.filter(isDecided);
  const tiers = [];
  const placed = new Set();
  const put = (ids) => {
    const tier = [...new Set(ids)].filter((id) => id && !placed.has(id));
    tier.forEach((id) => placed.add(id));
    if (tier.length) tiers.push(tier);
  };
  put([champion]);
  if (doubleElim) {
    const gf = decided.filter((m) => m.bracket === 'gf').sort((a, b) => b.position - a.position);
    put(gf.map(loserOf));
    const lb = decided.filter((m) => m.bracket === 'lb');
    for (const r of ascending(lb.map((m) => m.round))) put(lb.filter((m) => m.round === r).map(loserOf));
    const wb = decided.filter((m) => m.bracket === 'wb');
    for (const r of ascending(wb.map((m) => m.round))) put(wb.filter((m) => m.round === r).map(loserOf));
    // Left in a match without a result: by the furthest round reached.
    putByFurthestRound(matches.filter((m) => m.bracket === 'lb'));
    putByFurthestRound(matches.filter((m) => m.bracket === 'wb'));
  } else {
    const final = decided.find((m) => m.round === 1 && m.position === 1);
    if (final) put([loserOf(final)]);
    const third = decided.find((m) => m.round === 0);
    if (third) {
      put([third.winner_id]);
      put([loserOf(third)]);
    }
    // Everyone else by the furthest round reached, so a player whose last
    // match has no result (the opponent went through) still places there.
    putByFurthestRound(matches.filter((m) => m.round > 0));
  }
  return tiers;

  function putByFurthestRound(list) {
    const furthest = new Map();
    for (const m of list) {
      for (const id of [m.player1_id, m.player2_id]) {
        if (id) furthest.set(id, Math.min(furthest.get(id) ?? Infinity, m.round));
      }
    }
    for (const r of ascending([...furthest.values()])) put([...furthest].filter(([, round]) => round === r).map(([id]) => id));
  }
}

/**
 * Placings of a completed event: Map player_id -> { from, to }. `players`:
 * the registered players [{ id, seed, swiss_group }]. Empty when the event
 * has no champion.
 */
export function eventPlacements(t, matches = [], players = []) {
  const out = new Map();
  const champion = tournamentChampion(t, matches, players);
  if (!champion) return out;

  let tiers;
  if (t.format === 'swiss' && !t.playoff_format) {
    const table = computeStandings(players, matches.filter((m) => m.bracket === SWISS_BRACKET));
    tiers = table.map((row) => [row.player_id]);
  } else {
    const playoff = matches.filter((m) => !GROUP_STAGE.has(m.bracket));
    const doubleElim = t.playoff_format ? t.playoff_format === 'double_elim' : t.format === 'double_elim';
    tiers = eliminationTiers(playoff, doubleElim, champion);
  }

  let next = 1;
  for (const tier of tiers) {
    const to = next + tier.length - 1;
    for (const id of tier) out.set(id, { from: next, to });
    next = to + 1;
  }
  // Two-stage: knocked out in the groups, by group placing.
  if (t.playoff_format) {
    const rankOf = new Map();
    for (const g of groupStageOf(t, players, matches).groups || []) {
      for (const row of g.rows || []) if (row.rank) rankOf.set(row.player_id, row.rank);
    }
    const out_ = players.map((p) => p.id).filter((id) => !out.has(id) && rankOf.has(id));
    for (const rank of ascending(out_.map((id) => rankOf.get(id)))) {
      const tier = out_.filter((id) => rankOf.get(id) === rank);
      const to = next + tier.length - 1;
      for (const id of tier) out.set(id, { from: next, to });
      next = to + 1;
    }
  }
  // Everyone else (never decided a match).
  const rest = players.map((p) => p.id).filter((id) => !out.has(id));
  for (const id of rest) out.set(id, { from: next, to: next + rest.length - 1 });
  return out;
}

/** Better of two placings (lower `from`, then lower `to`); null-safe. */
export function betterPlace(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return b.from < a.from || (b.from === a.from && b.to < a.to) ? b : a;
}
