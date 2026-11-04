// Live update payload (GET /tournaments/:id/live): what changed after a
// match change, much smaller than the full event on a busy match day.

// Ratings are not needed for a delta (players are not sent).
export const NO_LADDER = Object.freeze({ ratingOf: () => null, cutoff: 0 });

// Transactions read NOW() when they start, so a match written by a
// transaction that began just before `since` and committed after it has an
// older updated_at. Matches changed this long before `since` are sent too.
export const SINCE_MARGIN_MS = 15_000;

/**
 * The full event detail reduced to a delta: no players or votes, the
 * matches changed since `since` (with the margin) and all match ids in
 * order.
 */
export function liveDelta(detail, since) {
  const { players: _players, votes: _votes, matches = [], ...rest } = detail;
  const from = since.getTime() - SINCE_MARGIN_MS;
  return {
    ...rest,
    delta: true,
    match_ids: matches.map((m) => m.id),
    changed_matches: matches.filter((m) => !m.updated_at || new Date(m.updated_at).getTime() >= from),
  };
}
