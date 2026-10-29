// Bracket display helpers.
//
// Internal round numbering is reversed: `round = 1` is the final, `round = max`
// is the first round. The UI must show rounds the other way around (Round 1,
// quarterfinals, ... final), which is what the helpers here do.

export function maxRound(matches = []) {
  let max = 1;
  for (const m of matches) {
    if (m && m.round > max) max = m.round;
  }
  return max;
}

/** 1-based round number counted from the first round (final = totalRounds). */
export function displayRound(round, totalRounds) {
  if (round === 0) return 0;
  return totalRounds - round + 1;
}

export function roundLabel(round, totalRounds) {
  if (round === 0) return "三四名决赛";
  const d = displayRound(round, totalRounds);
  if (d === totalRounds) return "总决赛";
  if (d === totalRounds - 1) return "半决赛";
  if (d === totalRounds - 2) return "四分之一决赛";
  return `第 ${d} 轮`;
}

/** Compact label for overlay tickers/badges: R1, QF, SF, F, 3rd. */
export function roundShortLabel(round, totalRounds) {
  if (round === 0) return "3RD";
  const d = displayRound(round, totalRounds);
  if (d === totalRounds) return "F";
  if (d === totalRounds - 1) return "SF";
  if (d === totalRounds - 2) return "QF";
  return `R${d}`;
}

/**
 * Stable bracket-order numbers (1..N), first round first, then position.
 * Completed matches keep their number, so the lowest pending number is the
 * recommended next match. Third-place match is numbered after the main bracket.
 */
export function buildMatchOrder(matches = []) {
  const order = new Map();
  let n = 0;
  // Swiss rounds count up (round 1 is played first); elimination rounds count
  // down to the final (round 1).
  const swiss = matches
    .filter((m) => m && m.bracket === "sw")
    .sort((a, b) => a.round - b.round || a.position - b.position || a.id - b.id);
  for (const m of swiss) order.set(m.id, ++n);
  // Group brackets of a two-stage event are played before the playoff.
  const GROUP = ["gse", "gwb", "glb"];
  const groupBrackets = matches
    .filter((m) => m && GROUP.includes(m.bracket))
    .sort(
      (a, b) =>
        (a.swiss_group || 1) - (b.swiss_group || 1) ||
        (a.bracket === "glb") - (b.bracket === "glb") ||
        (a.round === 0) - (b.round === 0) ||
        b.round - a.round ||
        a.position - b.position ||
        a.id - b.id,
    );
  for (const m of groupBrackets) order.set(m.id, ++n);
  const main = matches
    .filter((m) => m && m.bracket !== "sw" && !GROUP.includes(m.bracket) && m.round > 0)
    .sort((a, b) => b.round - a.round || a.position - b.position || a.id - b.id);
  for (const m of main) order.set(m.id, ++n);
  const third = matches
    .filter((m) => m && m.round === 0 && !GROUP.includes(m.bracket))
    .sort((a, b) => a.position - b.position || a.id - b.id);
  for (const m of third) order.set(m.id, ++n);
  return order;
}

/** Pending, playable matches in recommended order. */
export function playableMatchIds(matches = [], order = buildMatchOrder(matches)) {
  return matches
    .filter((m) => m.status === "pending" && m.player1_id && m.player2_id)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((m) => m.id);
}

/** Swiss matches grouped by round, first round first. */
export function groupSwissRounds(matches = []) {
  const groups = new Map();
  for (const m of matches) {
    if (!m || m.bracket !== "sw") continue;
    if (!groups.has(m.round)) groups.set(m.round, []);
    groups.get(m.round).push(m);
  }
  return [...groups.entries()]
    .map(([round, ms]) => ({
      round,
      matches: [...ms].sort((a, b) => a.position - b.position || a.id - b.id),
    }))
    .sort((a, b) => a.round - b.round);
}

/**
 * Group one bracket of a double-elimination tournament into columns.
 * Rounds keep the DB numbering, so the first column is the highest round.
 */
export function groupBracketRounds(matches = [], bracket) {
  const groups = new Map();
  for (const m of matches) {
    if (!m || m.bracket !== bracket) continue;
    if (!groups.has(m.round)) groups.set(m.round, []);
    groups.get(m.round).push(m);
  }
  return [...groups.entries()]
    .map(([round, ms]) => ({
      round,
      matches: [...ms].sort((a, b) => a.position - b.position || a.id - b.id),
    }))
    .sort((a, b) => b.round - a.round);
}

/** Number of rounds in one bracket (its highest DB round). */
export function bracketRoundTotal(matches = [], bracket) {
  return Math.max(1, ...matches.filter((m) => m && m.bracket === bracket).map((m) => m.round));
}

/** Headers for winners bracket, losers bracket and grand final columns. */
export function bracketRoundLabel(bracket, round, totalRounds) {
  const played = totalRounds - round + 1;
  if (bracket === "lb") {
    return played === totalRounds ? "败者组决赛" : `败者组第 ${played} 轮`;
  }
  if (bracket === "wb") {
    return played === totalRounds ? "胜者组决赛" : `胜者组第 ${played} 轮`;
  }
  if (bracket === "gf") return "总决赛";
  return roundLabel(round, totalRounds);
}

/**
 * Position one bracket band (winners or losers) on a Challonge-style tree.
 * First-round cards are stacked; every later match is centred between the
 * matches that feed it, so two-to-one joins and one-to-one cross feeds both
 * line up correctly. Works for byes too because they stay in the geometry.
 */
export function layoutBracketBand(
  matches = [],
  bracket,
  {
    cardHeight = 76,
    slotHeight = 104,
    columnWidth = 220,
    columnGap = 52,
  } = {},
) {
  const rounds = groupBracketRounds(matches, bracket);
  if (!rounds.length) {
    return { rounds: [], columns: [], width: 0, height: 0 };
  }

  const firstRound = rounds[0];
  const columns = [
    {
      round: firstRound.round,
      x: 0,
      matches: firstRound.matches.map((match, index) => ({
        match,
        x: 0,
        y: cardHeight / 2 + index * slotHeight,
      })),
    },
  ];

  for (let columnIndex = 1; columnIndex < rounds.length; columnIndex += 1) {
    const previous = columns[columnIndex - 1];
    const feeders = new Map();
    for (const item of previous.matches) {
      const targetId = item.match.next_match_id;
      if (targetId == null) continue;
      if (!feeders.has(targetId)) feeders.set(targetId, []);
      feeders.get(targetId).push(item.y);
    }

    const x = columnIndex * (columnWidth + columnGap);
    const items = rounds[columnIndex].matches.map((match, index) => {
      const ys = feeders.get(match.id) || [];
      const y = ys.length
        ? ys.reduce((sum, value) => sum + value, 0) / ys.length
        : cardHeight / 2 + index * slotHeight;
      return { match, x, y };
    });
    columns.push({ round: rounds[columnIndex].round, x, matches: items });
  }

  const height = Math.max(
    cardHeight,
    ...columns.flatMap((column) =>
      column.matches.map((item) => item.y + cardHeight / 2),
    ),
  );
  const width = columns.length * (columnWidth + columnGap) - columnGap;
  return { rounds, columns, width, height };
}

/** Orthogonal connector from the right edge of one card to the left of another. */
export function bracketConnectorPath(source, target, cardWidth, topOffset = 0) {
  const startX = source.x + cardWidth;
  const startY = source.y + topOffset;
  const endX = target.x;
  const endY = target.y + topOffset;
  if (Math.abs(startY - endY) < 1) {
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }
  const midX = startX + Math.max(12, (endX - startX) / 2);
  return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
}

/**
 * Single-elimination tree: card tops and centres so each match sits between
 * the two that feed it (pairs of first-round cards `g` apart, pairs `G`
 * apart, cards `H` high). Used by the event page and the overlay.
 */
export function treePositions(rounds, specs) {
  const empty = { positions: {}, centers: {}, totalHeight: 600 };
  if (!rounds?.length) return empty;
  const { H, g, G } = specs;
  const positions = {};
  const centers = {};
  const localMax = Math.max(...rounds.map((r) => r.round));
  const first = rounds.find((r) => r.round === localMax);
  if (!first) return empty;
  first.matches.forEach((m, idx) => {
    const pair = Math.floor(idx / 2);
    const top = idx % 2 === 0 ? pair * (2 * H + g + G) : pair * (2 * H + g + G) + H + g;
    positions[m.id] = { top, height: H };
    centers[m.id] = top + H / 2;
  });
  for (let round = localMax - 1; round >= 1; round -= 1) {
    const cur = rounds.find((r) => r.round === round);
    const prev = rounds.find((r) => r.round === round + 1);
    if (!cur || !prev) continue;
    cur.matches.forEach((m, idx) => {
      const p1 = prev.matches[idx * 2];
      const p2 = prev.matches[idx * 2 + 1];
      const center = p1 && p2 ? (centers[p1.id] + centers[p2.id]) / 2 : p1 ? centers[p1.id] : idx * 300 + 150;
      positions[m.id] = { top: center - H / 2, height: H };
      centers[m.id] = center;
    });
  }
  const totalHeight = first.matches.length ? Math.ceil(first.matches.length / 2) * (2 * H + g + G) - G : 600;
  return { positions, centers, totalHeight };
}

/**
 * Columns of a winners band with the grand final (and its reset) as one more
 * column after the winners final, Challonge-style.
 */
export function withGrandFinalColumn(columns, grandFinals, { cardWidth, cardHeight, columnGap, stackGap }) {
  const out = columns.map((column) => ({ ...column, grandFinal: false }));
  if (!grandFinals.length) return out;
  const last = out[out.length - 1];
  const x = last ? last.x + cardWidth + columnGap : 0;
  const anchorY = last?.matches?.[0]?.y ?? cardHeight / 2;
  out.push({
    round: 1,
    x,
    grandFinal: true,
    matches: grandFinals.map((match, index) => ({ match, x, y: anchorY + index * (cardHeight + stackGap) })),
  });
  return out;
}

/** Connectors between neighbouring columns: { d, active } per fed match. */
export function columnConnectors(columns, cardWidth, topOffset = 0) {
  const paths = [];
  for (let index = 0; index < columns.length - 1; index += 1) {
    const nextById = new Map(columns[index + 1].matches.map((item) => [item.match.id, item]));
    for (const source of columns[index].matches) {
      const target = nextById.get(source.match.next_match_id);
      if (!target) continue;
      paths.push({
        d: bracketConnectorPath(source, target, cardWidth, topOffset),
        active: Boolean(source.match.winner_id),
      });
    }
  }
  return paths;
}

/** Match numbers 1.. in the order given: lists of band columns or matches. */
export function numberMatches(...groups) {
  const ids = [];
  for (const group of groups) {
    for (const entry of group) {
      if (entry.matches) for (const item of entry.matches) ids.push(item.match.id);
      else ids.push(entry.id);
    }
  }
  return new Map(ids.map((id, index) => [id, index + 1]));
}
