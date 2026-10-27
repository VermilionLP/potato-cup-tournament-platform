// Potato Cup points (积分榜). An event's points table maps placings to
// points: [{ from, to, points }], e.g. 1st 100, 2nd 60, 3rd-4th 35,
// 5th-8th 10. Players earn the points of the row that contains their
// placing; the leaderboard adds them up per season (year) and event type.
// Pure functions.

export const MAX_POINTS_ROWS = 32;

/** Cleans a points table for storage. Returns { table } or { error }. */
export function normalizePointsTable(input) {
  if (input === null || input === undefined || (Array.isArray(input) && !input.length)) return { table: null };
  if (!Array.isArray(input)) return { error: '积分表必须是数组' };
  if (input.length > MAX_POINTS_ROWS) return { error: `积分表最多 ${MAX_POINTS_ROWS} 行` };
  const rows = [];
  for (const [i, raw] of input.entries()) {
    const from = Number(raw?.from);
    const to = raw?.to === undefined || raw?.to === null || raw?.to === '' ? from : Number(raw.to);
    const points = Number(raw?.points);
    if (!Number.isInteger(from) || from < 1 || from > 512) return { error: `积分表第 ${i + 1} 行的名次不正确` };
    if (!Number.isInteger(to) || to < from || to > 512) return { error: `积分表第 ${i + 1} 行的名次范围不正确` };
    if (!Number.isFinite(points) || points < 0 || points > 100000) return { error: `积分表第 ${i + 1} 行的积分不正确` };
    rows.push({ from, to, points: Math.round(points * 100) / 100 });
  }
  rows.sort((a, b) => a.from - b.from);
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].from <= rows[i - 1].to) return { error: `积分表的名次 ${rows[i].from} 重复了` };
  }
  return { table: rows };
}

/** Season label: a year like "2026"; '' = none. */
export function normalizeSeason(value) {
  const s = String(value ?? '').trim();
  return /^\d{4}$/.test(s) ? s : '';
}

/** Points for a placing { from, to } (the row containing `from`), else 0. */
export function pointsFor(table, place) {
  if (!table?.length || !place) return 0;
  const row = table.find((r) => place.from >= r.from && place.from <= r.to);
  return row ? row.points : 0;
}

/**
 * One leaderboard: events (in date order, each with its `awarded` map of
 * player -> points) -> players sorted by total; equal totals share a rank.
 */
export function buildBoard(events) {
  const totals = new Map();
  for (const ev of events) {
    for (const [playerId, pts] of Object.entries(ev.awarded)) {
      if (!pts) continue;
      const row = totals.get(playerId) || { player_id: playerId, total: 0, points: {}, events: 0 };
      row.total += pts;
      row.points[ev.id] = pts;
      row.events += 1;
      totals.set(playerId, row);
    }
  }
  const players = [...totals.values()].sort(
    (a, b) => b.total - a.total || b.events - a.events || a.player_id.localeCompare(b.player_id),
  );
  let rank = 0;
  players.forEach((p, i) => {
    if (i === 0 || p.total !== players[i - 1].total) rank = i + 1;
    p.rank = rank;
    p.total = Math.round(p.total * 100) / 100;
  });
  return players;
}
