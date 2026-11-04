// Event tiers (migration 031): a tier like Liquipedia's (S / A / B / C / D,
// liquipediatier 1-5) and a kind: major (大型赛事) / weekly (周赛) /
// qualifier (预选赛) since migration 043. Past imported events got
// Liquipedia's tier (migration 031); new events default from their points
// table (大型赛事 B, weekly C); admins can change both.

export const EVENT_TIERS = ['S', 'A', 'B', 'C', 'D'];
export const EVENT_KINDS = ['major', 'weekly', 'qualifier'];

/** "S".."D", or null. Also takes Liquipedia's 1-5. */
export function normalizeTier(value) {
  const v = String(value ?? '').trim().toUpperCase();
  if (EVENT_TIERS.includes(v)) return v;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? EVENT_TIERS[n - 1] : null;
}

export function normalizeKind(value) {
  const v = String(value ?? '').trim().toLowerCase();
  // Old names (before migration 043) still understood.
  if (v === 'season' || v === 'monthly') return 'major';
  return EVENT_KINDS.includes(v) ? v : null;
}

/** Liquipedia's liquipediatier number (1-5) of a tier, '' for none. */
export function liquipediaTierOf(tier) {
  const i = EVENT_TIERS.indexOf(tier);
  return i < 0 ? '' : String(i + 1);
}

/** Tier and kind of a new event created on the site. */
export function defaultTier({ tier, kind, pointsKind, name = '' } = {}) {
  const k = normalizeKind(kind) || (pointsKind ? (pointsKind === 'monthly' ? 'major' : 'weekly') : /weekly|周赛/i.test(name) ? 'weekly' : null);
  const t = normalizeTier(tier) || (k === 'major' ? 'B' : k === 'weekly' || k === 'qualifier' ? 'C' : null);
  return { tier: t, kind: k };
}

/**
 * Filter of the statistics (?tier=, ?kind=): a predicate on events, with the
 * chosen tier and kind ('' = all, 'none' = events without one).
 */
export function statsScope(query = {}) {
  const pick = (value, normalize) => {
    const v = String(value ?? '').trim();
    if (!v) return '';
    if (v.toLowerCase() === 'none') return 'none';
    return normalize(v) || '';
  };
  const tier = pick(query.tier, normalizeTier);
  const kind = pick(query.kind, normalizeKind);
  const matches = (value, wanted) => !wanted || (wanted === 'none' ? !value : value === wanted);
  const scope = (t) => matches(t.tier, tier) && matches(t.event_kind, kind);
  scope.tier = tier;
  scope.kind = kind;
  return scope;
}
