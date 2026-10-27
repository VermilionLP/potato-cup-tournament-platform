import assert from 'node:assert/strict';
import { test } from 'node:test';
import { betterPlace, eventPlacements } from '../lib/placements.js';

const m = (bracket, round, position, p1, p2, winner, extra = {}) => ({
  bracket, round, position, player1_id: p1, player2_id: p2, winner_id: winner, status: 'completed', score1: 0, score2: 0, ...extra,
});
const players = (...ids) => ids.map((id, i) => ({ id, seed: i + 1 }));
const places = (map) => Object.fromEntries([...map].map(([id, p]) => [id, p.from === p.to ? p.from : `${p.from}-${p.to}`]));

test('single elimination with a bye and an unplaced player', () => {
  const t = { status: 'completed', format: 'single_elim' };
  const matches = [
    m('main', 3, 1, 'a', 'b', 'a'),
    m('main', 3, 2, 'e', null, 'e'),
    m('main', 2, 1, 'a', 'c', 'c'),
    m('main', 2, 2, 'e', 'd', 'e'),
    m('main', 1, 1, 'c', 'e', 'e'),
  ];
  assert.deepEqual(places(eventPlacements(t, matches, players('a', 'b', 'c', 'd', 'e', 'f'))), {
    e: 1, c: 2, a: '3-4', d: '3-4', b: 5, f: 6,
  });
});

test('third-place match and double elimination', () => {
  const se = [m('main', 2, 1, 'a', 'b', 'a'), m('main', 2, 2, 'c', 'd', 'c'), m('main', 1, 1, 'a', 'c', 'c'), m('main', 0, 1, 'b', 'd', 'd')];
  assert.deepEqual(places(eventPlacements({ status: 'completed', format: 'single_elim' }, se, players('a', 'b', 'c', 'd'))), { c: 1, a: 2, d: 3, b: 4 });
  const de = [
    m('wb', 2, 1, 'a', 'b', 'a'), m('wb', 2, 2, 'c', 'd', 'c'), m('wb', 1, 1, 'a', 'c', 'a'),
    m('lb', 2, 1, 'b', 'd', 'd'), m('lb', 1, 1, 'c', 'd', 'c'),
    m('gf', 1, 1, 'a', 'c', 'c'), m('gf', 1, 2, 'a', 'c', 'a'),
  ];
  assert.deepEqual(places(eventPlacements({ status: 'completed', format: 'double_elim' }, de, players('a', 'b', 'c', 'd'))), { a: 1, c: 2, d: 3, b: 4 });
});

test('two-stage: playoff first, then group exits by group placing; unfinished events have none', () => {
  const t = { status: 'completed', format: 'swiss', playoff_format: 'single_elim', advance_per_group: 1, swiss_rounds: 2 };
  // Two groups of three: a / b win their groups; e, g are 2nd; f, h 3rd.
  const sw = (round, pos, p1, p2, w, group) => m('sw', round, pos, p1, p2, w, { swiss_group: group, score1: w === p1 ? 2 : 0, score2: w === p2 ? 2 : 0 });
  const matches = [
    sw(1, 1, 'a', 'e', 'a', 1), sw(2, 1, 'a', 'f', 'a', 1), sw(2, 2, 'e', 'f', 'e', 1),
    sw(1, 1, 'b', 'g', 'b', 2), sw(2, 1, 'b', 'h', 'b', 2), sw(2, 2, 'g', 'h', 'g', 2),
    m('main', 1, 1, 'a', 'b', 'b'),
  ];
  const field = [['a', 1], ['e', 1], ['f', 1], ['b', 2], ['g', 2], ['h', 2]].map(([id, g], i) => ({ id, seed: i + 1, swiss_group: g }));
  assert.deepEqual(places(eventPlacements(t, matches, field)), { b: 1, a: 2, e: '3-4', g: '3-4', f: '5-6', h: '5-6' });
  assert.equal(eventPlacements({ ...t, status: 'in_progress' }, matches, field).size, 0);
});

test('swiss single stage follows the standings', () => {
  const t = { status: 'completed', format: 'swiss' };
  const matches = [m('sw', 1, 1, 'a', 'b', 'a', { score1: 2 }), m('sw', 1, 2, 'c', 'd', 'c', { score1: 2 }), m('sw', 2, 1, 'a', 'c', 'a', { score1: 2 })];
  const p = eventPlacements(t, matches, players('a', 'b', 'c', 'd'));
  assert.deepEqual(p.get('a'), { from: 1, to: 1 });
  assert.equal(p.size, 4);
});

test('better place', () => {
  assert.deepEqual(betterPlace(null, { from: 3, to: 4 }), { from: 3, to: 4 });
  assert.deepEqual(betterPlace({ from: 3, to: 4 }, { from: 2, to: 2 }), { from: 2, to: 2 });
  assert.deepEqual(betterPlace({ from: 3, to: 3 }, { from: 3, to: 4 }), { from: 3, to: 3 });
});

test('a player whose last match has no result still places in that round', () => {
  // Quarterfinal c-d never got a result; c went through to the semifinal.
  const t = { status: 'completed', format: 'single_elim' };
  const matches = [
    m('main', 3, 1, 'a', 'b', 'a'), m('main', 3, 2, 'c', 'd', null, { status: 'pending' }),
    m('main', 3, 3, 'e', 'f', 'e'), m('main', 3, 4, 'g', 'h', 'g'),
    m('main', 2, 1, 'a', 'c', 'a'), m('main', 2, 2, 'e', 'g', 'e'),
    m('main', 1, 1, 'a', 'e', 'a'),
  ];
  assert.deepEqual(places(eventPlacements(t, matches, players('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'))), {
    a: 1, e: 2, c: '3-4', g: '3-4', b: '5-8', d: '5-8', f: '5-8', h: '5-8',
  });
});
