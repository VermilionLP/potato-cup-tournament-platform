// Final placings of an elimination bracket (single or double), best first.
//
// Players are grouped into tiers by how far they got: champion, runner-up,
// then (single elimination) the third-place match and each earlier round, or
// (double elimination) each losers-bracket round from the final backwards.
// Each tier gets the places it actually covers, so 17 players in a 32 bracket
// give "第 17 名" rather than "第 17 - 32 名". Rounds count down: 1 is the
// final, 0 is the third-place match.

const isDecided = (m) =>
  (m.status === "completed" || m.status === "walkover") &&
  Boolean(m.winner_id && m.player1_id && m.player2_id);
const loserOf = (m) => (m.winner_id === m.player1_id ? m.player2_id : m.player1_id);
const ascending = (values) => [...new Set(values)].sort((a, b) => a - b);

export function placeLabel(from, to) {
  if (from === to) {
    if (from === 1) return "第 1 名 (冠军)";
    if (from === 2) return "第 2 名 (亚军)";
    return `第 ${from} 名`;
  }
  return `第 ${from} - ${to} 名`;
}

/**
 * @param {object} args
 * @param {Array} args.matches  bracket matches (no group-stage matches)
 * @param {Array} args.players  [{ id, display_name, flag, team, link }]
 * @param {boolean} args.doubleElim
 * @param {object|null} args.championshipMatch  the match that decided the title
 * @returns rows sorted by place: { id, ..., rank, place, matchesPlayed, matchesWon }
 */
export function eliminationStandings({ matches = [], players = [], doubleElim = false, championshipMatch = null }) {
  const decided = matches.filter(isDecided);
  const tiers = [];
  const placed = new Set();
  const put = (ids) => {
    const tier = [...new Set(ids)].filter((id) => id && !placed.has(id));
    tier.forEach((id) => placed.add(id));
    if (tier.length) tiers.push(tier);
  };

  const titleDecided = championshipMatch && isDecided(championshipMatch);
  // Still playing (event not finished): ahead of everyone already out.
  if (!titleDecided) {
    const out = new Set(decided.map(loserOf));
    const active = new Set();
    for (const m of matches) {
      for (const id of [m.player1_id, m.player2_id]) if (id && !out.has(id)) active.add(id);
    }
    put([...active]);
  } else {
    put([championshipMatch.winner_id]);
    put([loserOf(championshipMatch)]);
  }

  if (doubleElim) {
    // A grand-final loser before a reset is the same player as the runner-up.
    put(decided.filter((m) => m.bracket === "gf").map(loserOf));
    const lb = decided.filter((m) => m.bracket === "lb");
    for (const round of ascending(lb.map((m) => m.round))) {
      put(lb.filter((m) => m.round === round).map(loserOf));
    }
    // Dropped from the winners bracket without a decided losers-bracket match.
    const wb = decided.filter((m) => m.bracket === "wb");
    for (const round of ascending(wb.map((m) => m.round))) {
      put(wb.filter((m) => m.round === round).map(loserOf));
    }
  } else {
    const third = decided.find((m) => m.round === 0);
    if (third) {
      put([third.winner_id]);
      put([loserOf(third)]);
    }
    const main = decided.filter((m) => m.round > 0);
    for (const round of ascending(main.map((m) => m.round))) {
      put(main.filter((m) => m.round === round).map(loserOf));
    }
  }

  const stats = new Map(players.map((p) => [p.id, { played: 0, won: 0 }]));
  for (const m of decided) {
    for (const id of [m.player1_id, m.player2_id]) {
      const s = stats.get(id);
      if (!s) continue;
      s.played += 1;
      if (m.winner_id === id) s.won += 1;
    }
  }

  const byId = new Map(players.map((p, i) => [p.id, { ...p, order: i }]));
  const rows = [];
  let next = 1;
  tiers.forEach((tier, index) => {
    const from = next;
    const to = next + tier.length - 1;
    next = to + 1;
    const stillIn = index === 0 && !titleDecided;
    const tierRows = tier
      .filter((id) => byId.has(id))
      .map((id) => ({
        ...byId.get(id),
        rank: stillIn ? "未淘汰" : placeLabel(from, to),
        place: stillIn ? 0 : from,
        matchesPlayed: stats.get(id)?.played ?? 0,
        matchesWon: stats.get(id)?.won ?? 0,
      }))
      .sort((a, b) => b.matchesWon - a.matchesWon || a.order - b.order);
    rows.push(...tierRows);
  });
  // Registered but never in a decided match (e.g. only had a bye).
  for (const p of players) {
    if (placed.has(p.id)) continue;
    rows.push({
      ...byId.get(p.id),
      rank: titleDecided ? "已淘汰" : "未淘汰",
      place: titleDecided ? next : 0,
      matchesPlayed: 0,
      matchesWon: 0,
    });
  }
  return rows.map(({ order, ...row }) => row);
}
