import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSeasonSummary, seasonList } from '../lib/season-summary.js';

const t = (id, date, extra = {}) => ({ id, name: id, status: 'completed', scheduled_time: `${date}T20:00`, ...extra });
const m = (p1, p2, w) => ({ player1_id: p1, player2_id: p2, winner_id: w, status: 'completed' });
const places = (rows) => new Map(rows.map(([id, from, to = from]) => [id, { from, to }]));

function ctx() {
  const tournaments = [t('w1', '2026-03-01'), t('w2', '2026-05-01'), t('q1', '2026-06-01', { event_kind: 'qualifier' }), t('old', '2025-05-01'), t('pts', '2027-01-10', { points_season: '2026' })];
  const many = Array.from({ length: 10 }, () => m('a', 'c', 'a'));
  return {
    tournaments,
    registrations: new Map(tournaments.map((e) => [e.id, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]])),
    matches: new Map([['w1', [m('a', 'b', 'a'), ...many]], ['w2', [m('a', 'b', 'b'), { ...m('c', 'b', 'b'), status: 'walkover' }]], ['q1', [m('c', 'a', 'c')]], ['old', [m('b', 'a', 'b')]], ['pts', [m('b', 'c', 'b')]]]),
    places: new Map([
      ['w1', places([['a', 1], ['b', 2], ['c', 3]])],
      ['w2', places([['b', 1], ['a', 2]])],
      ['q1', places([['c', 1]])],
      ['old', places([['b', 1]])],
      ['pts', places([['b', 1], ['c', 2]])],
    ]),
    names: new Map([['a', { name: 'Alpha', flag: 'cn' }], ['b', { name: 'Bravo', flag: 'ru' }]]),
  };
}

test('a season: numbers, champions newest first, qualifiers give no title', () => {
  const s = buildSeasonSummary('2026', ctx());
  assert.equal(s.events, 4); // w1, w2, q1, pts (points season 2026, played 2027)
  assert.equal(s.players, 3);
  assert.equal(s.matches, 14); // 11 + 1 + 1 + 1; the walkover not counted
  assert.deepEqual(s.champions.map((c) => [c.event.id, c.winner.id]), [['pts', 'b'], ['w2', 'b'], ['w1', 'a']]);
  assert.deepEqual(s.champions[1].runner_up, { id: 'a', name: 'Alpha', flag: 'cn' });
  assert.deepEqual(s.leaders.titles.map((r) => [r.id, r.value]), [['b', 2], ['a', 1]]);
  assert.equal(s.leaders.wins[0].id, 'a');
  assert.deepEqual(s.leaders.winRate.map((r) => r.id), ['a', 'c']); // b has fewer than 10 matches
});

test('seasons offered: points seasons and years played, newest first', () => {
  assert.deepEqual(seasonList(['2026'], ctx().tournaments), ['2026', '2025']);
});
