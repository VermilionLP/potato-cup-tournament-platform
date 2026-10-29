import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPlayerStatistics } from '../lib/player-statistics.js';
import { statsScope } from '../lib/event-tier.js';

const players = ['a', 'b', 'c'].map((id) => ({ id, display_name: id.toUpperCase(), flag: '', team: '' }));
const final = (id, t, p1, p2, s1, s2) => ({ id, tournament_id: t, bracket: 'main', round: 1, position: 1, player1_id: p1, player2_id: p2, winner_id: s1 > s2 ? p1 : p2, score1: s1, score2: s2, status: 'completed' });
const tournaments = [
  { id: 'w1', name: 'Weekly 1', status: 'completed', format: 'single_elim', game_mode: 'rb', vehicle_pool: 'prop', tier: 'C', event_kind: 'weekly' },
  { id: 's1', name: 'Spring', status: 'completed', format: 'single_elim', game_mode: 'ab', vehicle_pool: 'top-jet', tier: 'A', event_kind: 'season' },
  { id: 'q1', name: 'Spring Qualifier', status: 'completed', format: 'single_elim', game_mode: 'rb', vehicle_pool: 'prop', tier: 'C', event_kind: 'qualifier' },
];
const matches = [final(1, 'w1', 'a', 'b', 2, 0), final(2, 's1', 'b', 'a', 3, 1), final(3, 'q1', 'c', 'a', 2, 1)];
const registrations = matches.flatMap((m) => [m.player1_id, m.player2_id].map((p, i) => ({ tournament_id: m.tournament_id, player_id: p, seed: i + 1 })));
const ladder = { byId: new Map([['a', { games: 3, last_game_at: '2026-10-01' }]]) };
const run = (query = {}) => {
  const scope = statsScope(query);
  const ts = tournaments.filter(scope);
  const ids = new Set(ts.map((t) => t.id));
  return buildPlayerStatistics({
    players, tournaments: ts, scope, ladder, now: Date.parse('2026-10-29'),
    registrations: registrations.filter((r) => ids.has(r.tournament_id)),
    matches: matches.filter((m) => ids.has(m.tournament_id)),
    playedMatches: matches.map((m) => ({ tournament_id: m.tournament_id })),
  });
};

test('records, titles by tier (qualifiers excluded) and rankings', () => {
  const all = run();
  const a = all.players.find((p) => p.id === 'a');
  assert.deepEqual([a.matches_won, a.matches_lost, a.maps_won, a.maps_lost, a.tournaments_played], [1, 2, 4, 5, 3]);
  assert.equal(a.modes.ab.matches_lost, 1);
  assert.equal(a.pools['top-jet'].matches_lost, 1);
  assert.deepEqual(a.championships_by_tier, { C: 1 });
  const b = all.players.find((p) => p.id === 'b');
  assert.deepEqual(b.championships_by_tier, { A: 1 });
  assert.equal(all.players.find((p) => p.id === 'c').championships, 0, 'a qualifier is not a title');
  assert.deepEqual(all.global, { total_players: 3, total_tournaments: 3, total_matches: 3 });
  assert.deepEqual(all.rankings.by_championships.map((p) => p.id).sort(), ['a', 'b']);
  assert.equal(a.rated, true);
  assert.equal(a.active, true);
});

test('scoped to a tier: only its events and the players in them', () => {
  const season = run({ tier: 'A' });
  assert.deepEqual(season.scope, { tier: 'A', kind: '' });
  assert.deepEqual(season.players.map((p) => p.id).sort(), ['a', 'b']);
  assert.deepEqual(season.global, { total_players: 2, total_tournaments: 1, total_matches: 1 });
  assert.equal(season.players.find((p) => p.id === 'a').championships, 0);
});

test('the statistics route caches per scope until a write', async () => {
  const { default: playerStatsRoutes } = await import('../routes/player-stats.js');
  const { invalidateLadder } = await import('../lib/ladder-cache.js');
  let reads = 0;
  const db = {
    async query(sql) {
      const text = String(sql);
      if (text.includes('FROM axsuck.tournaments')) reads += 1;
      if (text.includes('FROM axsuck.players')) return { rows: players };
      if (text.includes('FROM axsuck.tournaments')) return { rows: tournaments };
      if (text.includes('FROM axsuck.tournament_players')) return { rows: registrations };
      if (text.includes('FROM axsuck.matches m')) return { rows: [] }; // ladder games
      if (text.includes('FROM axsuck.matches')) return { rows: matches };
      return { rows: [] };
    },
  };
  const routes = new Map();
  await playerStatsRoutes({ db, get: (path, handler) => routes.set(path, handler) });
  const get = (query) => routes.get('/players/statistics')({ query });
  const first = await get({});
  await get({});
  assert.equal(reads, 1);
  await get({ tier: 'A' });
  assert.equal(reads, 2, 'another scope is computed on its own');
  invalidateLadder(db);
  const again = await get({});
  assert.equal(reads, 3);
  assert.deepEqual(again.global, first.global);
});

test('runner-ups by tier (qualifiers excluded) and their board', () => {
  const all = run();
  const a = all.players.find((p) => p.id === 'a');
  const b = all.players.find((p) => p.id === 'b');
  assert.equal(a.runner_ups, 1, 'second in Spring; the qualifier loss does not count');
  assert.deepEqual(a.runner_ups_by_tier, { A: 1 });
  assert.deepEqual(b.runner_ups_by_tier, { C: 1 });
  assert.deepEqual(all.rankings.by_runner_ups.map((p) => p.id).sort(), ['a', 'b']);
  const weekly = run({ kind: 'weekly' });
  assert.deepEqual(weekly.rankings.by_runner_ups.map((p) => p.id), ['b']);
});
