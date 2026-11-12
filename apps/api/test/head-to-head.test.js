import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHeadToHead, MEETINGS_SHOWN } from '../lib/head-to-head.js';

const t = (id, date) => ({ id, name: id, status: 'completed', scheduled_time: `${date}T20:00` });
const m = (id, p1, p2, s1, s2, extra = {}) => ({ id, player1_id: p1, player2_id: p2, score1: s1, score2: s2, winner_id: s1 > s2 ? p1 : p2, status: 'completed', round: 1, ...extra });

function ctx() {
  return {
    tournaments: [t('w1', '2026-01-01'), t('w2', '2026-03-01'), t('w3', '2026-05-01')],
    matches: new Map([
      ['w1', [m(1, 'a', 'b', 2, 1), m(2, 'a', 'c', 2, 0)]],
      ['w2', [m(3, 'b', 'a', 2, 0)]],
      ['w3', [m(4, 'a', 'b', 0, 0, { status: 'walkover', winner_id: 'a' })]],
      ['gone', [m(5, 'a', 'b', 2, 0)]], // not a finished event
    ]),
    banpick: [{ id: 1, banpick: { state: { phase: 'done', vehicle: 'T-80B' } } }, { id: 3, banpick: { state: { phase: 'ban' } } }],
    names: new Map([['a', { name: 'Alpha', flag: 'cn' }], ['b', { name: 'Bravo', flag: 'ru' }]]),
  };
}

test('series, games, walkovers and meetings newest first, from either side', () => {
  const h = buildHeadToHead('a', 'b', ctx());
  assert.deepEqual(h.series, { a: 2, b: 1 });
  assert.deepEqual(h.games, { a: 2, b: 3 }, 'walkovers have no games');
  assert.equal(h.walkovers, 1);
  assert.deepEqual(h.meetings.map((x) => [x.event.id, x.score_a, x.score_b, x.winner]), [['w3', null, null, 'a'], ['w2', 0, 2, 'b'], ['w1', 2, 1, 'a']]);
  assert.equal(h.meetings[2].vehicle, 'T-80B');
  assert.equal(h.meetings[1].vehicle, null, 'Ban / Pick not finished');
  assert.deepEqual(h.vehicles, [{ name: 'T-80B', times: 1 }]);
  assert.deepEqual(h.a, { id: 'a', name: 'Alpha', flag: 'cn' });
  const back = buildHeadToHead('b', 'a', ctx());
  assert.deepEqual([back.series, back.games], [{ a: 1, b: 2 }, { a: 3, b: 2 }]);
});

test('never met; long histories are cut', () => {
  assert.equal(buildHeadToHead('b', 'c', ctx()).total, 0);
  const many = { ...ctx(), matches: new Map([['w1', Array.from({ length: 12 }, (_, i) => m(10 + i, 'a', 'b', 2, 0))]]) };
  const h = buildHeadToHead('a', 'b', many);
  assert.equal(h.total, 12);
  assert.equal(h.meetings.length, MEETINGS_SHOWN);
});
