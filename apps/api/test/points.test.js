import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBoard, finalsQualifiers, normalizePointsKind, normalizePointsTable, normalizeSeason, pointsFor } from '../lib/points.js';

const weekly = [{ from: 1, to: 1, points: 100 }, { from: 2, to: 2, points: 60 }, { from: 3, to: 4, points: 35 }, { from: 5, to: 8, points: 10 }];

test('points tables are checked and sorted', () => {
  assert.deepEqual(normalizePointsTable([{ from: '3', to: '4', points: '35' }, { from: 1, points: 100 }]).table,
    [{ from: 1, to: 1, points: 100 }, { from: 3, to: 4, points: 35 }]);
  assert.equal(normalizePointsTable([]).table, null);
  assert.equal(normalizePointsTable(null).table, null);
  assert.match(normalizePointsTable([{ from: 0, points: 1 }]).error, /名次/);
  assert.match(normalizePointsTable([{ from: 3, to: 2, points: 1 }]).error, /范围/);
  assert.match(normalizePointsTable([{ from: 1, points: -1 }]).error, /积分/);
  assert.match(normalizePointsTable([{ from: 1, to: 4, points: 1 }, { from: 3, points: 1 }]).error, /重复/);
  assert.equal(normalizeSeason(' 2026 '), '2026');
  assert.equal(normalizeSeason('26'), '');
});

test('points for a placing', () => {
  assert.equal(pointsFor(weekly, { from: 1, to: 1 }), 100);
  assert.equal(pointsFor(weekly, { from: 3, to: 4 }), 35);
  assert.equal(pointsFor(weekly, { from: 5, to: 6 }), 10);
  assert.equal(pointsFor(weekly, { from: 9, to: 16 }), 0);
  assert.equal(pointsFor(null, { from: 1, to: 1 }), 0);
});

test('board totals, shared ranks', () => {
  const board = buildBoard([
    { id: 'w1', awarded: { a: 100, b: 60, c: 35 } },
    { id: 'w2', awarded: { b: 100, a: 60, d: 0 } },
    { id: 'w3', awarded: { c: 125 } },
  ]);
  // Equal totals: more events first, then by id.
  assert.deepEqual(board.map((p) => [p.player_id, p.total]), [['a', 160], ['b', 160], ['c', 160]]);
  assert.deepEqual(board.map((p) => p.rank), [1, 1, 1]);
  assert.deepEqual(board.find((p) => p.player_id === 'a').points, { w1: 100, w2: 60 });
  assert.equal(board.find((p) => p.player_id === 'd'), undefined);
});

test('Winter Finals: invited champions first, then the points ranking', () => {
  assert.equal(normalizePointsKind('monthly'), 'monthly');
  assert.equal(normalizePointsKind('x'), 'weekly');
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id, i) => ({ player_id: id, total: 100 - i * 10 }));
  // a won two invite events: the second invite passes to that event's runner-up b.
  const invites = [{ id: 'm1', order: ['a', 'x'] }, { id: 'm2', order: ['a', 'b', 'c'] }, { id: 'm3', order: ['p1', 'p2'] }];
  const q = finalsQualifiers(players, invites, { spots: 6 });
  assert.deepEqual(Object.fromEntries([...q].map(([id, v]) => [id, v.via === 'invite' ? v.event_id : 'points'])), {
    a: 'm1', b: 'm2', p1: 'm3', p2: 'points', p3: 'points', p4: 'points',
  });
  // An unfinished invite event keeps its place reserved.
  const reserved = finalsQualifiers(players, [{ id: 'later', order: null }], { spots: 3 });
  assert.deepEqual([...reserved.keys()], ['p1', 'p2']);
  // Players without points never qualify by points.
  assert.equal(finalsQualifiers([{ player_id: 'z', total: 0 }], [], { spots: 2 }).size, 0);
});
