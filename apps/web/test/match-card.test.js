import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCompletedBye, isMine, isPlayableIn, slotScore } from '../src/lib/match-card.js';
import { columnConnectors, numberMatches, treePositions, withGrandFinalColumn } from '../src/lib/bracket.js';

const m = (o) => ({ id: 1, status: 'pending', player1_id: 'a', player2_id: 'b', winner_id: null, score1: 0, score2: 0, ...o });

test('slotScore: pending blank, walkover W / FF, else the score', () => {
  assert.equal(slotScore(m({}), 1), '');
  assert.equal(slotScore(m({ status: 'walkover', winner_id: 'b' }), 1), 'FF');
  assert.equal(slotScore(m({ status: 'walkover', winner_id: 'b' }), 2), 'W');
  assert.equal(slotScore(m({ status: 'completed', score1: 2, score2: 1, winner_id: 'a' }), 2), 1);
});

test('isPlayableIn needs a running event and both players', () => {
  assert.equal(isPlayableIn(m({}), 'in_progress'), true);
  assert.equal(isPlayableIn(m({}), 'registration'), false);
  assert.equal(isPlayableIn(m({ player2_id: null }), 'in_progress'), false);
  assert.equal(isPlayableIn(m({ status: 'completed' }), 'in_progress'), false);
});

test('isCompletedBye and isMine', () => {
  assert.equal(isCompletedBye(m({ status: 'completed', winner_id: 'a', player2_id: null })), true);
  assert.equal(isCompletedBye(m({ status: 'completed', winner_id: 'a' })), false);
  assert.equal(isMine(m({}), 'b'), true);
  assert.equal(isMine(m({}), ''), false);
  assert.equal(isMine(m({ status: 'completed' }), 'a'), false);
});

test('treePositions centres a final between its two semifinals', () => {
  const rounds = [
    { round: 2, matches: [{ id: 1 }, { id: 2 }] },
    { round: 1, matches: [{ id: 3 }] },
  ];
  const { centers, totalHeight } = treePositions(rounds, { H: 64, g: 20, G: 40 });
  assert.equal(centers[1], 32);
  assert.equal(centers[2], 64 + 20 + 32);
  assert.equal(centers[3], (centers[1] + centers[2]) / 2);
  assert.equal(totalHeight, 2 * 64 + 20);
});

test('grand final column, connectors and numbers', () => {
  const wb = [
    { round: 2, x: 0, matches: [{ match: { id: 1, next_match_id: 3, winner_id: 'a' }, x: 0, y: 10 }, { match: { id: 2, next_match_id: 3 }, x: 0, y: 50 }] },
    { round: 1, x: 100, matches: [{ match: { id: 3, next_match_id: 9 }, x: 100, y: 30 }] },
  ];
  const cols = withGrandFinalColumn(wb, [{ id: 9 }, { id: 10 }], { cardWidth: 80, cardHeight: 20, columnGap: 20, stackGap: 5 });
  assert.equal(cols.length, 3);
  assert.deepEqual(cols[2].matches.map((i) => [i.x, i.y]), [[200, 30], [200, 55]]);
  const paths = columnConnectors(cols, 80);
  assert.equal(paths.length, 3);
  assert.deepEqual(paths.map((p) => p.active), [true, false, false]);
  const numbers = numberMatches(wb, [], [{ id: 9 }], [{ id: 7 }]);
  assert.deepEqual([...numbers], [[1, 1], [2, 2], [3, 3], [9, 4], [7, 5]]);
});
