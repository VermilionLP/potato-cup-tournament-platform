import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBoard, normalizePointsTable, normalizeSeason, pointsFor } from '../lib/points.js';
import { parsePrizePoolPoints } from '../lib/liquipedia/points.js';

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

test('Liquipedia prize pools', () => {
  const single = `==Prize Pool==\n{{SoloPrizePool|localcurrency=cny\n|points1=PotatoCup Leaderboard 2026|points1link=Potato_Cup/Leaderboard/2026\n|{{Slot|place=1|localprize=136|points=100}}\n|{{Slot|place=2|localprize=49|points=60}}\n|{{Slot|place=3-4|localprize=8|points=35}}\n|{{Slot|place=5-8|localprize=0|points=10}}\n}}`;
  assert.deepEqual(parsePrizePoolPoints(single), { season: '2026', table: weekly });
  const two = `{{SoloPrizePool|localcurrency=cny\n|points1=PotatoCup Leaderboard 2026|points1link=Potato_Cup/Leaderboard/2026\n|points2=FamilyX Leaderboard 2026|points2link=FamilyX/Leaderboard/2026\n|{{Slot|place=1|localprize=136|qualified1=true|points1=100|points2=3200}}\n|{{Slot|place=2|points1=60|points2=2200}}\n|{{Slot|place=3-4|points1=35|points2=1000}}\n}}`;
  assert.deepEqual(parsePrizePoolPoints(two).table.map((r) => r.points), [100, 60, 35]);
  const other = `{{SoloPrizePool|points1=FamilyX|points1link=FamilyX/Leaderboard/2026\n|{{Slot|place=1|points=5}}}}`;
  assert.equal(parsePrizePoolPoints(other), null, 'only Potato Cup leaderboards');
  assert.equal(parsePrizePoolPoints(`{{SoloPrizePool|{{Slot|place=1|points=30}}}}`), null, 'no leaderboard link');
  assert.equal(parsePrizePoolPoints('no prize pool'), null);
});
