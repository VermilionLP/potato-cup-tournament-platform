// A season at a glance (GET /seasons/:season/summary, the /season page):
// its events, players and matches, every champion (newest first), and the
// season's leaders in titles, wins and win rate. Qualifiers count as events
// played but give no titles (like the hall of fame). Pure: the routes pass
// the awards context (routes/player-awards.js awardsData).

import { isQualifierEvent } from './champions.js';
import { dateOf } from './hall-of-fame.js';
import { normalizeKind } from './event-tier.js';
import { seasonEvents } from './player-awards.js';

export const LEADERS = 5;
// Win rate needs placement done (like the ladder and the 名人堂 board).
export const WIN_RATE_MIN = 10;

function rank(rows, value, n = LEADERS) {
  return rows
    .filter((r) => value(r) > 0)
    .sort((a, b) => value(b) - value(a) || a.id.localeCompare(b.id))
    .slice(0, n);
}

/**
 * { season, events, players, matches, champions:[{ event, winner }],
 *   leaders: { titles, wins, winRate } } for one season.
 */
export function buildSeasonSummary(season, ctx) {
  const events = seasonEvents(ctx.tournaments, season).filter((t) => t.status === 'completed');
  const who = (id) => ({ id, name: ctx.names.get(id)?.name || id, flag: ctx.names.get(id)?.flag || '' });
  const per = new Map();
  const row = (id) => {
    if (!per.has(id)) per.set(id, { id, titles: 0, wins: 0, matches: 0 });
    return per.get(id);
  };
  const players = new Set();
  let matches = 0;
  const champions = [];

  for (const t of events) {
    for (const r of ctx.registrations.get(t.id) || []) players.add(r.id);
    for (const m of ctx.matches.get(t.id) || []) {
      if (m.status !== 'completed' || !m.winner_id || !m.player1_id || !m.player2_id) continue;
      matches += 1;
      row(m.player1_id).matches += 1;
      row(m.player2_id).matches += 1;
      row(m.winner_id).wins += 1;
    }
    if (isQualifierEvent(t)) continue;
    const places = ctx.places.get(t.id) || new Map();
    const winners = [...places.entries()].filter(([, p]) => p.from === 1).map(([id]) => id);
    if (winners.length !== 1) continue;
    row(winners[0]).titles += 1;
    const runnerUp = [...places.entries()].find(([, p]) => p.from === 2)?.[0] || null;
    champions.push({
      event: { id: t.id, name: t.name, date: dateOf(t), tier: t.tier || '', kind: normalizeKind(t.event_kind) || '', pool: t.vehicle_pool || '' },
      winner: who(winners[0]),
      runner_up: runnerUp ? who(runnerUp) : null,
    });
  }
  champions.sort((a, b) => String(b.event.date || '').localeCompare(String(a.event.date || '')) || b.event.id.localeCompare(a.event.id));

  const rows = [...per.values()];
  const withName = (r, extra) => ({ ...who(r.id), ...extra });
  return {
    season: String(season),
    events: events.length,
    players: players.size,
    matches,
    champions,
    leaders: {
      titles: rank(rows, (r) => r.titles).map((r) => withName(r, { value: r.titles })),
      wins: rank(rows, (r) => r.wins).map((r) => withName(r, { value: r.wins, matches: r.matches })),
      winRate: rank(rows.filter((r) => r.matches >= WIN_RATE_MIN), (r) => r.wins / r.matches).map((r) => withName(r, { value: r.wins / r.matches, wins: r.wins, matches: r.matches })),
    },
  };
}

/**
 * Seasons to offer: the points seasons, then the years events were played,
 * newest first.
 */
export function seasonList(pointsSeasons = [], tournaments = []) {
  const set = new Set(pointsSeasons.map(String).filter(Boolean));
  for (const t of tournaments) {
    if (t.points_season) set.add(String(t.points_season));
    else {
      const y = String(dateOf(t) || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) set.add(y);
    }
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}
