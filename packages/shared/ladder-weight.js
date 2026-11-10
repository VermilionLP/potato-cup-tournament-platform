// How much an event's games move ladder MMR: the Elo K of every game is
// multiplied by its event's weight, by the event's kind (tournaments.
// event_kind). Major events count more than the weekly cups. Used by the
// server's ladder (apps/api/lib/ladder.js) and the site's MMR preview
// (apps/web/src/lib/ladder-sim.js), so both agree.

export const LADDER_WEIGHTS = Object.freeze({
  major: 1.5, // 大型赛事
  qualifier: 1.25, // 预选赛
  weekly: 1, // 周赛
});
// Events without a kind (unset).
export const DEFAULT_LADDER_WEIGHT = 1;

/** The weight of an event kind; old names (season / monthly) are major. */
export function ladderWeight(kind) {
  const k = String(kind ?? '').trim().toLowerCase();
  const key = k === 'season' || k === 'monthly' ? 'major' : k;
  return LADDER_WEIGHTS[key] ?? DEFAULT_LADDER_WEIGHT;
}
