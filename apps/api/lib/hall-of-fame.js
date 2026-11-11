// Hall of fame (GET /hall-of-fame): every finished event's podium, newest
// first, and the all-time records. Pure: the route passes the rows.
//
// Podiums come from eventPlacements (the same places as the event page);
// qualifiers decide who reaches an event, so they are listed but give no
// titles. Records: titles, podiums, events played, matches won, the longest
// run of won matches and the highest ladder MMR ever reached (from the
// ladder's history, in rating order).

import { eventPlacements } from './placements.js';
import { isQualifierEvent } from './champions.js';

const TOP = 5;

const iso = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
/** When the event was played: played_at, the scheduled day, else created. "YYYY-MM-DD..." for sorting. */
export function dateOf(t) {
  if (t.played_at) return iso(t.played_at);
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(String(t.scheduled_time || ''));
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return t.created_at ? iso(t.created_at) : null;
}

function top(map, value, extra = () => ({})) {
  return [...map.entries()]
    .map(([id, v]) => ({ id, value: value(v), ...extra(v) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || String(a.id).localeCompare(String(b.id)))
    .slice(0, TOP);
}

/**
 * tournaments: rows of axsuck.tournaments; registrations: tournament_players
 * rows; matches: the decided matches of every event; history: the ladder's
 * history (chronological, two rows per game); names: Map id -> { name, flag }.
 */
export function buildHallOfFame({ tournaments = [], registrations = [], matches = [], history = [], names = new Map() }) {
  const who = (id) => ({ id, name: names.get(id)?.name || id, flag: names.get(id)?.flag || '' });
  const regBy = new Map();
  for (const r of registrations) {
    if (!regBy.has(r.tournament_id)) regBy.set(r.tournament_id, []);
    regBy.get(r.tournament_id).push({ id: r.player_id, seed: r.seed, swiss_group: r.swiss_group });
  }
  const matchesBy = new Map();
  for (const m of matches) {
    if (!matchesBy.has(m.tournament_id)) matchesBy.set(m.tournament_id, []);
    matchesBy.get(m.tournament_id).push(m);
  }

  const titles = new Map();
  const podiums = new Map();
  const played = new Map();
  const events = [];
  for (const t of tournaments.filter((x) => x.status === 'completed')) {
    const players = regBy.get(t.id) || [];
    for (const p of players) played.set(p.id, (played.get(p.id) || 0) + 1);
    const places = eventPlacements(t, matchesBy.get(t.id) || [], players);
    const podium = [...places.entries()]
      .filter(([, p]) => p.from <= 3)
      .sort((a, b) => a[1].from - b[1].from)
      .map(([id, p]) => ({ ...who(id), place: p.from, to: p.to }));
    if (!podium.length) continue;
    const qualifier = isQualifierEvent(t);
    if (!qualifier) {
      for (const p of podium) {
        podiums.set(p.id, (podiums.get(p.id) || 0) + 1);
        if (p.place === 1) titles.set(p.id, (titles.get(p.id) || 0) + 1);
      }
    }
    events.push({
      id: t.id,
      name: t.name,
      date: dateOf(t),
      tier: t.tier || null,
      kind: t.event_kind || null,
      pool: t.vehicle_pool || '',
      qualifier,
      players: players.length,
      podium,
    });
  }
  events.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  // Ladder records: wins, the longest winning run, the highest MMR.
  const wins = new Map();
  const run = new Map();
  const bestRun = new Map();
  const peak = new Map();
  for (const h of history) {
    const id = h.player_id;
    if (h.won) {
      wins.set(id, (wins.get(id) || 0) + 1);
      run.set(id, (run.get(id) || 0) + 1);
      if (run.get(id) > (bestRun.get(id) || 0)) bestRun.set(id, run.get(id));
    } else run.set(id, 0);
    const after = Math.round(h.rating_after);
    if (!peak.has(id) || after > peak.get(id).value) peak.set(id, { value: after, at: h.played_at || null });
  }

  const named = (rows) => rows.map((r) => ({ ...who(r.id), ...r }));
  return {
    events,
    records: {
      titles: named(top(titles, (v) => v)),
      podiums: named(top(podiums, (v) => v)),
      events: named(top(played, (v) => v)),
      wins: named(top(wins, (v) => v)),
      streak: named(top(bestRun, (v) => v)),
      peak: named(top(peak, (v) => v.value, (v) => ({ at: v.at }))),
    },
  };
}
