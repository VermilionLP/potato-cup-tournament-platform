// Ban / Pick statistics (GET /banpick/stats) from the matches' server-kept
// Ban / Pick (matches.banpick, lib/banpick.js). Counted from the log as it
// stands: undone steps and everything before the last reset are left out.
//
// Pools differ by event type (prop, top-jet...), so the numbers are per
// type; `types` lists every type with Ban / Pick data.

import { effectiveEntries } from './banpick.js';

const DONE_RESULTS = new Set(['completed', 'walkover']);

function bump(map, key, field, extra = {}) {
  if (!key) return;
  if (!map.has(key)) map.set(key, { ...extra, bans: 0, drawn: 0, removed: 0, played: 0 });
  map.get(key)[field] += 1;
}

const ranked = (map, field) => [...map.values()].filter((x) => x[field] > 0).sort((a, b) => b[field] - a[field] || String(a.name).localeCompare(String(b.name)));

/**
 * rows: [{ banpick, vehicle_pool, player1_id, player2_id, winner_id, status }]
 * Returns { types: [{ type, matches }], type, matches, confirmed, bans,
 * passes, groups, vehicles, banners, player? } for `type` (default: the type
 * with the most matches); with `player`, that player's bans and played
 * vehicles (with wins), over every type.
 *
 * groups.table / vehicles.table list every group / played vehicle (the
 * statistics page's vehicle tab); banners are the players who banned most
 * in this type, each with their most banned groups.
 */
export function buildBanpickStats(rows = [], { type = '', player = '' } = {}) {
  const withBp = rows.filter((r) => r.banpick?.state && effectiveEntries(r.banpick.log).length);
  const counts = new Map();
  for (const r of withBp) counts.set(r.vehicle_pool || '', (counts.get(r.vehicle_pool || '') || 0) + 1);
  const types = [...counts.entries()].map(([t, matches]) => ({ type: t, matches })).sort((a, b) => b.matches - a.matches);
  const chosen = type && counts.has(type) ? type : types[0]?.type ?? '';
  const scoped = withBp.filter((r) => (r.vehicle_pool || '') === chosen);

  const groups = new Map();
  const vehicles = new Map();
  let confirmed = 0;
  let bans = 0;
  let passes = 0;
  const banners = new Map();
  const mine = { bans: new Map(), vehicles: new Map() };

  for (const r of scoped) {
    const entries = effectiveEntries(r.banpick.log);
    const state = r.banpick.state;
    for (const e of entries) {
      if (e.action === 'ban') bump(groups, e.group, 'bans', { name: e.group });
      else if (e.action === 'drawGroup') bump(groups, e.group, 'drawn', { name: e.group });
      else if (e.action === 'removeGroup') bump(groups, e.group, 'removed', { name: e.group });
      else if (e.action === 'drawVehicle') bump(vehicles, e.vehicle, 'drawn', { name: e.vehicle, group: e.group });
      else if (e.action === 'removeVehicle') bump(vehicles, e.vehicle, 'removed', { name: e.vehicle, group: e.group });
    }
    // Who banned what (the state's bans: undone ones are already gone).
    for (const b of state.bans || []) {
      const id = b.by === 'A' ? r.player1_id : b.by === 'B' ? r.player2_id : null;
      if (!b.group) {
        passes += 1;
        continue;
      }
      bans += 1;
      if (!id) continue;
      if (!banners.has(id)) banners.set(id, { id, bans: 0, groups: new Map() });
      const who = banners.get(id);
      who.bans += 1;
      who.groups.set(b.group, (who.groups.get(b.group) || 0) + 1);
    }
    if (state.phase === 'done') {
      confirmed += 1;
      bump(groups, state.group, 'played', { name: state.group });
      if (state.vehicle) bump(vehicles, state.vehicle, 'played', { name: state.vehicle, group: state.group });
    }
  }

  // The player's own bans and played vehicles, over every type.
  for (const r of player ? withBp : []) {
    const state = r.banpick.state;
    if (r.player1_id === player || r.player2_id === player) {
      const side = r.player1_id === player ? 'A' : 'B';
      for (const b of state.bans || []) {
        if (b.by === side && b.group) mine.bans.set(b.group, (mine.bans.get(b.group) || 0) + 1);
      }
      if (state.phase === 'done') {
        const label = state.vehicle || `${state.group}（组内任选）`;
        const v = mine.vehicles.get(label) || { name: label, played: 0, wins: 0, decided: 0 };
        v.played += 1;
        if (DONE_RESULTS.has(r.status)) {
          v.decided += 1;
          if (r.winner_id === player) v.wins += 1;
        }
        mine.vehicles.set(label, v);
      }
    }
  }

  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const out = {
    types,
    type: chosen,
    matches: scoped.length,
    confirmed,
    bans,
    passes,
    groups: {
      banned: ranked(groups, 'bans').slice(0, 10),
      drawn: ranked(groups, 'drawn').slice(0, 10),
      played: ranked(groups, 'played').slice(0, 10),
      table: [...groups.values()].sort((a, b) => b.bans - a.bans || b.played - a.played || byName(a, b)),
    },
    vehicles: {
      played: ranked(vehicles, 'played').slice(0, 10),
      removed: ranked(vehicles, 'removed').slice(0, 10),
      table: ranked(vehicles, 'played'),
    },
    banners: [...banners.values()]
      .map((b) => ({
        id: b.id,
        bans: b.bans,
        top: [...b.groups.entries()].map(([group, n]) => ({ group, n })).sort((x, y) => y.n - x.n || x.group.localeCompare(y.group)).slice(0, 3),
      }))
      .sort((a, b) => b.bans - a.bans || a.id.localeCompare(b.id))
      .slice(0, 10),
  };
  if (player) {
    out.player = {
      bans: [...mine.bans.entries()].map(([group, n]) => ({ group, n })).sort((a, b) => b.n - a.n).slice(0, 5),
      vehicles: [...mine.vehicles.values()].sort((a, b) => b.played - a.played).slice(0, 5),
    };
  }
  return out;
}
