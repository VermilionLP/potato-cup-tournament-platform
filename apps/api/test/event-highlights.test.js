import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHighlights, lateness } from '../lib/event-highlights.js';

const m = (id, p1, p2, s1, s2, extra = {}) => ({ id, player1_id: p1, player2_id: p2, score1: s1, score2: s2, winner_id: s1 > s2 ? p1 : p2, status: 'completed', bracket: 'main', round: 1, ...extra });
const h = (game_id, player_id, rating_before) => ({ game_id, player_id, rating_before });

test('lateness: grand final, then the final, third place, earlier rounds', () => {
  assert.ok(lateness({ bracket: 'gf', round: 1 }) > lateness({ bracket: 'main', round: 1 }));
  assert.ok(lateness({ bracket: 'main', round: 1 }) > lateness({ bracket: 'main', round: 0 }));
  assert.ok(lateness({ bracket: 'main', round: 0 }) > lateness({ bracket: 'main', round: 2 }));
  assert.ok(lateness({ bracket: 'sw', round: 4 }) > lateness({ bracket: 'sw', round: 1 }));
});

test('the biggest upset, the closest other match and the dark horse', () => {
  const matches = [
    m('a', 'low', 'high', 2, 1, { round: 2 }),
    m('b', 'x', 'y', 2, 1, { round: 2 }),
    m('c', 'low', 'x', 3, 2, { round: 1 }),
    m('d', 'p', 'q', 2, 0, { round: 3 }),
  ];
  const history = [h('a', 'low', 2900), h('a', 'high', 3200), h('b', 'x', 3000), h('b', 'y', 3020), h('c', 'low', 2950), h('c', 'x', 3010), h('d', 'p', 3000), h('d', 'q', 3100)];
  const places = new Map([['low', { from: 1, to: 1 }], ['x', { from: 2, to: 2 }], ['p', { from: 3, to: 4 }]]);
  const seeds = new Map([['low', 6], ['x', 2], ['p', 4]]);
  const out = buildHighlights({ matches, history, places, seeds });
  assert.equal(out.upset.match_id, 'a');
  assert.equal(out.upset.gap, 300);
  assert.equal(out.upsets, 3); // a, c and d (gaps 300, 60, 100); b is 20
  assert.equal(out.closest.match_id, 'c'); // 5 games beats 3
  assert.deepEqual(out.darkHorse, { id: 'low', seed: 6, place: 1, place_to: 1, gain: 5 });
});

test('nothing to say: no history, no close match, no climber', () => {
  const out = buildHighlights({ matches: [m('a', 'x', 'y', 2, 0)], places: new Map([['x', { from: 1, to: 1 }]]), seeds: new Map([['x', 2]]) });
  assert.deepEqual(out, { upset: null, upsets: 0, closest: null, darkHorse: null });
});

test('the closest match falls back to the upset when it is the only close one', () => {
  const out = buildHighlights({ matches: [m('a', 'low', 'high', 2, 1)], history: [h('a', 'low', 2800), h('a', 'high', 3000)] });
  assert.equal(out.closest.match_id, 'a');
});
