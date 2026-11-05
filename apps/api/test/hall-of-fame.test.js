import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHallOfFame } from '../lib/hall-of-fame.js';

const t = (id, extra = {}) => ({ id, name: id, status: 'completed', format: 'single_elim', ...extra });
// 4-player single elimination: semis (round 2), final (round 1).
const bracket = (tid, [a, b, c, d], champ, runner) => [
  { tournament_id: tid, bracket: 'main', round: 2, position: 1, player1_id: a, player2_id: b, winner_id: a === champ || a === runner ? a : b, status: 'completed' },
  { tournament_id: tid, bracket: 'main', round: 2, position: 2, player1_id: c, player2_id: d, winner_id: c === champ || c === runner ? c : d, status: 'completed' },
  { tournament_id: tid, bracket: 'main', round: 1, position: 1, player1_id: champ, player2_id: runner, winner_id: champ, status: 'completed' },
];
const reg = (tid, ids) => ids.map((player_id, i) => ({ tournament_id: tid, player_id, seed: i + 1 }));

test('podiums newest first; titles skip qualifiers; ladder records', () => {
  const tournaments = [
    t('w1', { scheduled_time: '2026-10-01T20:00' }),
    t('w2', { scheduled_time: '2026-10-08T20:00' }),
    t('q1', { scheduled_time: '2026-10-15T20:00', event_kind: 'qualifier' }),
    { id: 'open', status: 'registration' },
  ];
  const matches = [
    ...bracket('w1', ['a', 'b', 'c', 'd'], 'a', 'c'),
    ...bracket('w2', ['a', 'b', 'c', 'd'], 'a', 'd'),
    ...bracket('q1', ['a', 'b', 'c', 'd'], 'b', 'c'),
  ];
  const registrations = [...reg('w1', ['a', 'b', 'c', 'd']), ...reg('w2', ['a', 'b', 'c', 'd']), ...reg('q1', ['a', 'b', 'c', 'd'])];
  const history = [
    { player_id: 'a', won: true, rating_after: 3016 }, { player_id: 'b', won: false, rating_after: 2984 },
    { player_id: 'a', won: true, rating_after: 3030 }, { player_id: 'c', won: false, rating_after: 2985 },
    { player_id: 'a', won: false, rating_after: 3012 }, { player_id: 'b', won: true, rating_after: 3002 },
  ];
  const names = new Map([['a', { name: 'Alice', flag: 'cn' }]]);
  const h = buildHallOfFame({ tournaments, registrations, matches, history, names });
  assert.deepEqual(h.events.map((e) => e.id), ['q1', 'w2', 'w1']);
  assert.deepEqual(h.events[1].podium.slice(0, 2).map((p) => [p.name, p.place]), [['Alice', 1], ['d', 2]]);
  assert.equal(h.events[0].qualifier, true);
  assert.deepEqual(h.records.titles.map((r) => [r.id, r.value]), [['a', 2]]);
  assert.equal(h.records.events[0].value, 3);
  assert.deepEqual(h.records.streak.map((r) => [r.id, r.value]), [['a', 2], ['b', 1]]);
  assert.deepEqual(h.records.peak[0], { id: 'a', name: 'Alice', flag: 'cn', value: 3030, at: null });
});
