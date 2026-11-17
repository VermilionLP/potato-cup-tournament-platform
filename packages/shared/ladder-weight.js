// How much an event's games move ladder MMR: the Elo K of every game is
// multiplied by its event's weight = the kind's weight (tournaments.
// event_kind: major events count more than weekly cups; qualifiers count
// the same as weekly cups) times the tier's (tournaments.tier, S-D; C, the
// weekly cups' default, is 1). Used by the server's ladder
// (apps/api/lib/ladder.js) and the site's MMR preview
// (apps/web/src/lib/ladder-sim.js), so both agree.

export const LADDER_WEIGHTS = Object.freeze({
  major: 1.5, // 大型赛事
  qualifier: 1, // 预选赛：和周赛一样
  weekly: 1, // 周赛
});
export const TIER_WEIGHTS = Object.freeze({ S: 2, A: 1.5, B: 1.25, C: 1, D: 0.75 });
// Events without a kind / tier (unset).
export const DEFAULT_LADDER_WEIGHT = 1;

/** The weight of an event kind; old names (season / monthly) are major. */
export function kindWeight(kind) {
  const k = String(kind ?? '').trim().toLowerCase();
  const key = k === 'season' || k === 'monthly' ? 'major' : k;
  return LADDER_WEIGHTS[key] ?? DEFAULT_LADDER_WEIGHT;
}

/** The weight of a tier (S-D); unset counts as 1. */
export function tierWeight(tier) {
  return TIER_WEIGHTS[String(tier ?? '').trim().toUpperCase()] ?? DEFAULT_LADDER_WEIGHT;
}

/** An event's ladder weight: kind × tier (rounded to 3 decimals). */
export function ladderWeight(kind, tier = null) {
  return Math.round(kindWeight(kind) * tierWeight(tier) * 1000) / 1000;
}
