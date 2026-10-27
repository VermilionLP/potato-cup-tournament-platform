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

// Winter Finals: 16 places per event type. Admins choose which events'
// champions get a direct invite (直邀); every invite event holds one place,
// the rest go to the points ranking (e.g. 4 invites + 12 by points).
export const FINALS_SPOTS = 16;
export const POINTS_KINDS = ['weekly', 'monthly'];

/** 'weekly' (default) or 'monthly'. */
export function normalizePointsKind(value) {
  return value === 'monthly' ? 'monthly' : 'weekly';
}

/**
 * Winter Finals places for one board. `invites`: the board's invite events in
 * date order, { id, order } with `order` the player ids by placing (null
 * while the event is not finished: its place stays reserved). An invite
 * goes to the champion; a champion who already holds an invite passes it on
 * to the runner-up (and so on). The remaining places go to the best of the
 * points ranking (`players`, sorted) not yet qualified.
 * Returns Map player_id -> { via: 'invite', event_id } | { via: 'points' }.
 */
export function finalsQualifiers(players, invites, { spots = FINALS_SPOTS } = {}) {
  const out = new Map();
  for (const ev of invites) {
    const next = ev.order?.find((id) => !out.has(id));
    if (next) out.set(next, { via: 'invite', event_id: ev.id });
  }
  const pointsSpots = Math.max(0, spots - invites.length);
  let taken = 0;
  for (const p of players) {
    if (taken >= pointsSpots) break;
    if (out.has(p.player_id) || !(p.total > 0)) continue;
    out.set(p.player_id, { via: 'points' });
    taken += 1;
  }
  return out;
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
