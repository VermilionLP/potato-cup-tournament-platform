// Games per match for each bracket round: the "BO3" on a round header.
// Stored per event as tournaments.round_best_of, { [roundKey]: n }. Keys
// are the bracket and the stored round ("main:1" is the single-elimination
// final, "main:0" the third-place match, "wb:2", "lb:3", "gf:1", "sw:1",
// group brackets "gse:2" / "gwb:1" / "glb:1"). Group brackets share one
// setting per round across the groups.

export const BRACKET_CODES = ['main', 'wb', 'lb', 'gf', 'sw', 'gse', 'gwb', 'glb'];
// The choices offered; any odd count from 1 to 9 is accepted.
export const BEST_OF_CHOICES = [1, 3, 5, 7];
export const MAX_BEST_OF = 9;

const KEY = new RegExp(`^(${BRACKET_CODES.join('|')}):(\\d{1,2})$`);

/** The setting key of a match's round. */
export function roundKey(match) {
  if (!match) return '';
  return `${match.bracket || 'main'}:${Number(match.round) || 0}`;
}

export const isRoundKey = (key) => KEY.test(String(key || ''));

/** A valid best-of (odd, 1..9) as a number, else null. */
export function normalizeBestOf(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_BEST_OF && n % 2 === 1 ? n : null;
}

/** The stored map, keeping only valid entries. */
export function normalizeRoundBestOf(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    const n = normalizeBestOf(value);
    if (isRoundKey(key) && n) out[key] = n;
  }
  return out;
}

/** Best-of of a match's round in an event, or null when not set. */
export function bestOfFor(t, match) {
  return normalizeBestOf(t?.round_best_of?.[roundKey(match)]);
}

/** Games a player must win: BO3 → 2. */
export const winsNeeded = (bestOf) => Math.ceil(Number(bestOf) / 2);

/** "BO3". */
export const bestOfLabel = (bestOf) => (bestOf ? `BO${bestOf}` : '');

/**
 * A reported score that cannot finish a best-of-N match, as a message, or
 * '' (also when no best-of is set). The winner must reach the wins needed
 * and the loser must stay under it.
 */
export function scoreProblem(bestOf, score1, score2) {
  const n = normalizeBestOf(bestOf);
  if (!n) return '';
  const need = winsNeeded(n);
  const hi = Math.max(Number(score1) || 0, Number(score2) || 0);
  const lo = Math.min(Number(score1) || 0, Number(score2) || 0);
  if (hi === need && lo < need) return '';
  return `本轮 BO${n}，先赢 ${need} 局的一方获胜`;
}
