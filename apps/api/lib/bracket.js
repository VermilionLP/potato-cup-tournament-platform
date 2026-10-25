// Liquipedia SE bracket templates for 2..32 players.
// The digits in every name sum to the player count; 15 was previously
// duplicated with the 14-player template.
export const LIQUIPEDIA_BRACKET_TEMPLATES = {
  2: "Bracket/2",
  3: "Bracket/2L1D",
  4: "Bracket/4",
  5: "Bracket/2L1DH2L",
  6: "Bracket/4L2DS",
  7: "Bracket/2L1DH4L",
  8: "Bracket/8",
  9: "Bracket/2L1DH2LH4L",
  10: "Bracket/4L2DH4LS",
  11: "Bracket/2L1DH2LH4L2DSL",
  12: "Bracket/8L4DSS",
  13: "Bracket/2L1DH4LH4L2DSL",
  14: "Bracket/4L2DH8LS",
  15: "Bracket/2L1DH4LH8L",
  16: "Bracket/16",
  17: "Bracket/2L1DH2LH4LH8L",
  18: "Bracket/4L2DH4LH8LS",
  19: "Bracket/2L1DH2LH4LH4L2DH4LSL",
  20: "Bracket/8L4DH8LSS",
  21: "Bracket/2L1DH2LH4L2DSLH4L2DH4LSL",
  22: "Bracket/4L2DH4LH8L4DSLS",
  23: "Bracket/2L1DH2LH4L2DSLH8L4DSSL",
  24: "Bracket/16L8DSSS",
  25: "Bracket/2L1DH4LH4L2DSLH8L4DSSL",
  26: "Bracket/4L2DH8LH8L4DSLS",
  27: "Bracket/2L1DH4LH4L2DSLH4L2DH8LSL",
  28: "Bracket/8L4DH16LSS",
  29: "Bracket/2L1DH4LH8LH4L2DH8LSL",
  30: "Bracket/4L2DH8LH16LS",
  31: "Bracket/2L1DH4LH8LH16L",
  32: "Bracket/32",
};

export function liquipediaBracketTemplate(playerCount) {
  const n = Math.max(2, Math.floor(Number(playerCount) || 2));
  const exact = LIQUIPEDIA_BRACKET_TEMPLATES[n];
  if (exact) return exact;
  // Exact names for 33+ are not in the table yet; use the next power-of-two
  // template (the bracket itself still has byes for the empty slots).
  return `Bracket/${1 << Math.ceil(Math.log2(n))}`;
}

/**
 * Describe the single-elimination bracket for n players.
 *
 * P = next power of two; the bracket's second round has P/2 slots.
 * Seeds 1..P-n get byes; the remaining N-P/2 first-round matches fill
 * the other slots. Round numbers match the DB convention: max round is
 * the first round, round 1 is the final.
 */
export function describeBracket(playerCount) {
  const n = Math.max(2, Math.floor(Number(playerCount) || 2));
  const size = 1 << Math.ceil(Math.log2(n));
  const firstRoundMatches = n - size / 2;
  const byes = size - n;
  const totalRounds = Math.log2(size);
  const rounds = [];
  let matches = size / 2;

  for (let round = totalRounds; round >= 1; round -= 1, matches /= 2) {
    const isFirst = round === totalRounds;
    rounds.push({
      round,
      matches: isFirst ? firstRoundMatches : matches,
      byes: isFirst ? byes : 0,
    });
  }

  return {
    players: n,
    size,
    firstRoundMatches,
    byes,
    totalRounds,
    totalMatches: n - 1,
    rounds,
  };
}
