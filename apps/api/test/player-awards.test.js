import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAchievements, buildSeasonRecap, seasonEvents, seasonPointsRanking, ACHIEVEMENTS } from '../lib/player-awards.js';

const t = (id, extra = {}) => ({ id, name: id, status: 'completed', scheduled_time: '2026-10-01T20:00', ...extra });
const m = (p1, p2, s1, s2, extra = {}) => ({ player1_id: p1, player2_id: p2, score1: s1, score2: s2, winner_id: s1 > s2 ? p1 : p2, status: 'completed', ...extra });
const hist = (tid, a, b, aWon, ra = 3000, rb = 3000) => [
  { tournament_id: tid, player_id: a, opponent_id: b, won: aWon, rating_before: ra, rating_after: ra + (aWon ? 16 : -16), opponent_rating_before: rb },
  { tournament_id: tid, player_id: b, opponent_id: a, won: !aWon, rating_before: rb, rating_after: rb + (aWon ? -16 : 16), opponent_rating_before: ra },
];

function ctx() {
  const tournaments = [t('w1'), t('m1', { event_kind: 'major', scheduled_time: '2026-11-01T20:00' }), t('old', { scheduled_time: '2025-05-01T20:00' }), t('q1', { event_kind: 'qualifier' })];
  return {
    tournaments,
    registrations: new Map(tournaments.map((e) => [e.id, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]])),
    matches: new Map([
      ['w1', [m('a', 'b', 2, 0), m('a', 'c', 2, 0)]],
      ['m1', [m('a', 'b', 2, 1), m('c', 'a', 0, 0, { status: 'walkover', winner_id: 'a' })]],
      ['old', [m('b', 'a', 2, 0)]],
      ['q1', [m('a', 'b', 2, 0)]],
    ]),
    places: new Map([
      ['w1', new Map([['a', { from: 1, to: 1 }], ['b', { from: 2, to: 2 }], ['c', { from: 3, to: 3 }]])],
      ['m1', new Map([['a', { from: 1, to: 1 }], ['b', { from: 2, to: 2 }], ['c', { from: 3, to: 3 }]])],
      ['old', new Map([['b', { from: 1, to: 1 }], ['a', { from: 2, to: 2 }]])],
      ['q1', new Map([['a', { from: 1, to: 1 }]])],
    ]),
    history: [...hist('old', 'b', 'a', true), ...hist('w1', 'a', 'b', true, 2700, 3050), ...hist('w1', 'a', 'c', true), ...hist('m1', 'a', 'b', true), ...hist('q1', 'a', 'b', true)],
    banpick: [{ tournament_id: 'w1', player1_id: 'a', player2_id: 'b', banpick: { state: { phase: 'done', vehicle: 'T-80B' } } }],
    names: new Map([['a', { name: 'Alpha', flag: 'cn' }], ['b', { name: 'Bravo', flag: 'ru' }]]),
  };
}

test('achievements: titles skip qualifiers, majors, perfect runs, giant kills', () => {
  const out = buildAchievements('a', ctx());
  const got = Object.fromEntries(out.achievements.map((x) => [x.id, x]));
  assert.equal(out.total, ACHIEVEMENTS.length);
  assert.equal(got['first-title'].earned, true);
  assert.equal(got['three-titles'].value, 2); // q1 is a qualifier
  assert.equal(got['major-title'].earned, true);
  assert.equal(got['perfect-run'].earned, true); // w1, 2:0 and 2:0
  assert.equal(got['giant-killer'].earned, true); // 2700 beat 3050
  assert.equal(got['streak-5'].value, 4);
  assert.equal(out.earned, out.achievements.filter((x) => x.earned).length);
});

test('a walkover loss ends the attendance badge', () => {
  const got = buildAchievements('c', ctx()).achievements.find((x) => x.id === 'iron');
  assert.equal(got.value, 0);
});

test('season events: the points season, else the year played', () => {
  assert.deepEqual(seasonEvents(ctx().tournaments, '2026').map((e) => e.id), ['w1', 'm1', 'q1']);
  assert.deepEqual(seasonEvents([t('x', { points_season: '2025' })], '2025').map((e) => e.id), ['x']);
});

test('season recap: record, titles, rival, vehicle, peak', () => {
  const r = buildSeasonRecap('a', '2026', ctx(), { total: 120, rank: 1, of: 3 });
  assert.equal(r.player.name, 'Alpha');
  assert.equal(r.events, 3);
  assert.equal(r.wins, 4);
  assert.equal(r.losses, 0);
  assert.equal(r.titles, 2);
  assert.equal(r.rival.id, 'b');
  assert.equal(r.rival.played, 3);
  assert.deepEqual(r.vehicle, { name: 'T-80B', times: 1 });
  assert.equal(r.peak_mmr, 3016);
  assert.equal(r.best.place, 1);
  assert.deepEqual(r.points, { total: 120, rank: 1, of: 3 });
});

test('seasonPointsRanking sums boards; ties share a rank', () => {
  const boards = [{ players: [{ id: 'a', total: 100 }, { id: 'b', total: 60 }] }, { players: [{ player_id: 'b', total: 40 }, { id: 'c', total: 10 }] }];
  assert.deepEqual(seasonPointsRanking(boards), [{ id: 'a', total: 100, rank: 1 }, { id: 'b', total: 100, rank: 1 }, { id: 'c', total: 10, rank: 3 }]);
});
