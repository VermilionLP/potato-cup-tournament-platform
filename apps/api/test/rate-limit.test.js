import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, RATE_LIMITS } from '../lib/rate-limit.js';

test('writes are limited per IP and window', () => {
  let t = 0;
  const limiter = createRateLimiter(RATE_LIMITS, () => t);
  for (let i = 0; i < 60; i += 1) assert.equal(limiter.check('1.1.1.1', '/api/tournaments/x/vote'), null);
  const blocked = limiter.check('1.1.1.1', '/api/tournaments/x/vote');
  assert.equal(blocked.retryAfter, 60);
  // Another IP is not affected.
  assert.equal(limiter.check('2.2.2.2', '/api/tournaments/x/vote'), null);
  // The window rolls over.
  t = 60_000;
  assert.equal(limiter.check('1.1.1.1', '/api/tournaments/x/vote'), null);
});

test('binding device keys has its own, stricter bucket', () => {
  const limiter = createRateLimiter(RATE_LIMITS, () => 0);
  for (let i = 0; i < 10; i += 1) assert.equal(limiter.check('1.1.1.1', '/api/players/alice/key'), null);
  assert.ok(limiter.check('1.1.1.1', '/api/players/alice/key'));
  assert.equal(limiter.check('1.1.1.1', '/api/players/alice/touch'), null);
});

test('old entries are swept', () => {
  let t = 0;
  const limiter = createRateLimiter(RATE_LIMITS, () => t);
  limiter.check('1.1.1.1', '/api/x');
  t = 120_001;
  limiter.check('2.2.2.2', '/api/x');
  assert.equal(limiter.size(), 1);
});
