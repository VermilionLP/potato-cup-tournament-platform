import test from 'node:test';
import assert from 'node:assert/strict';
import { corsOrigin } from '../lib/cors.js';

test('CORS origins from the environment', () => {
  assert.equal(corsOrigin(undefined), false, 'same-origin only by default');
  assert.equal(corsOrigin(''), false);
  assert.equal(corsOrigin('*'), true);
  assert.deepEqual(corsOrigin('https://a.example/, https://b.example'), ['https://a.example', 'https://b.example']);
});
