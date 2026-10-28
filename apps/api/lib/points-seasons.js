// Points seasons ended on the leaderboard are locked: their events' points
// cannot change and no event can join them.

/** The first of `seasons` that has ended, or null. */
export async function endedSeason(db, ...seasons) {
  const list = seasons.filter(Boolean);
  if (!list.length) return null;
  const row = (await db.query(
    'SELECT season FROM axsuck.points_seasons WHERE season = ANY($1::text[]) AND ended_at IS NOT NULL LIMIT 1',
    [list],
  )).rows[0];
  return row?.season || null;
}
