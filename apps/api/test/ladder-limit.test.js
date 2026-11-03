import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ladderLimitProblem, normalizeLadderLimit } from '../lib/ladder-limit.js';

test('normalizeLadderLimit validates and clears', () => {
  assert.deepEqual(normalizeLadderLimit({}), { max_mmr: null, max_tier: null });
  assert.deepEqual(normalizeLadderLimit({ ladder_max_mmr: '3300', ladder_max_tier: '' }), { max_mmr: 3300, max_tier: null });
  assert.deepEqual(normalizeLadderLimit({ ladder_max_tier: 'gold' }), { max_mmr: null, max_tier: 'gold' });
  assert.ok(normalizeLadderLimit({ ladder_max_mmr: 3300.5 }).error);
  assert.ok(normalizeLadderLimit({ ladder_max_mmr: 50 }).error);
  assert.ok(normalizeLadderLimit({ ladder_max_tier: 'wood' }).error);
  assert.ok(normalizeLadderLimit({ ladder_max_mmr: 3300, ladder_max_tier: 'gold' }).error);
});

test('ladderLimitProblem', () => {
  const rated = (mmr, games = 20, group = 'gold') => ({ mmr, games, tier: { group, name: `${group} I` } });
  assert.equal(ladderLimitProblem({}, null), null, 'no limit');
  const byMmr = { ladder_max_mmr: 3300 };
  assert.match(ladderLimitProblem(byMmr, null), /还没有成绩/);
  assert.match(ladderLimitProblem(byMmr, rated(3000, 4)), /定级中（4 \/ 10 场）/);
  assert.equal(ladderLimitProblem(byMmr, rated(3300)), null);
  assert.match(ladderLimitProblem(byMmr, rated(3301)), /3300 及以下.*3301/);
  const byTier = { ladder_max_tier: 'gold' };
  assert.equal(ladderLimitProblem(byTier, rated(3500, 20, 'gold')), null);
  assert.equal(ladderLimitProblem(byTier, rated(2500, 20, 'bronze')), null);
  assert.match(ladderLimitProblem(byTier, rated(3500, 20, 'platinum')), /黄金及以下/);
  assert.match(ladderLimitProblem({ ladder_max_tier: 'master' }, rated(4000, 50, 'grandmaster')), /大师及以下/);
});
