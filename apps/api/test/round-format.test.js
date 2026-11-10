import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bestOfFor,
  isRoundKey,
  normalizeBestOf,
  normalizeRoundBestOf,
  roundKey,
  scoreProblem,
  winsNeeded,
} from '@potato-cup/shared/round-format.js';

test('round keys: bracket and stored round', () => {
  assert.equal(roundKey({ bracket: 'main', round: 1 }), 'main:1');
  assert.equal(roundKey({ round: 0 }), 'main:0');
  assert.equal(roundKey({ bracket: 'lb', round: 3 }), 'lb:3');
  assert.ok(isRoundKey('sw:12'));
  assert.ok(!isRoundKey('xx:1'));
  assert.ok(!isRoundKey('main:'));
  assert.ok(!isRoundKey('main:1;drop'));
});

test('best-of: odd, 1 to 9', () => {
  assert.equal(normalizeBestOf('3'), 3);
  assert.equal(normalizeBestOf(2), null);
  assert.equal(normalizeBestOf(11), null);
  assert.equal(normalizeBestOf(0), null);
  assert.deepEqual(normalizeRoundBestOf({ 'main:1': 5, 'wb:2': 4, bad: 3 }), { 'main:1': 5 });
  assert.equal(winsNeeded(5), 3);
  assert.equal(bestOfFor({ round_best_of: { 'gf:1': 5 } }, { bracket: 'gf', round: 1, position: 2 }), 5);
  assert.equal(bestOfFor({}, { bracket: 'gf', round: 1 }), null);
});

test('a score must end the best-of', () => {
  assert.equal(scoreProblem(3, 2, 1), '');
  assert.equal(scoreProblem(3, 0, 2), '');
  assert.match(scoreProblem(3, 3, 0), /BO3/);
  assert.match(scoreProblem(3, 1, 0), /先赢 2 局/);
  assert.equal(scoreProblem(1, 1, 0), '');
  assert.equal(scoreProblem(null, 5, 0), '');
});
