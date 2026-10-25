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
  const main = matches
    .filter((m) => m && m.round > 0)
    .sort((a, b) => b.round - a.round || a.position - b.position || a.id - b.id);
  let n = 0;
  for (const m of main) order.set(m.id, ++n);
  const third = matches
    .filter((m) => m && m.round === 0)
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
