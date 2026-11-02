import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanClientError, fingerprint, CLIENT_ERROR_LIMITS } from '../lib/client-errors.js';

test('reports are cleaned and bounded', () => {
  assert.ok(cleanClientError({}).error);
  const { report } = cleanClientError({ message: 'x'.repeat(2000), stack: 's', page: 'https://site/tournament/t1?token=abc#live', userAgent: 'UA' });
  assert.equal(report.message.length, CLIENT_ERROR_LIMITS.message);
  assert.equal(report.page, '/tournament/t1', 'no query or hash');
  assert.equal(cleanClientError({ message: 'm', page: 'not a url' }).report.page, '/not%20a%20url');
});

test('repeats share a fingerprint', () => {
  const a = fingerprint({ message: "Cannot read properties of undefined (reading 'id')", stack: 'TypeError: x\n    at f (https://site/_app/immutable/chunks/AbCdEf12.js:1:2345)' });
  const b = fingerprint({ message: "Cannot read properties of undefined (reading 'id')", stack: 'TypeError: x\n    at f (https://site/_app/immutable/chunks/AbCdEf12.js:1:9999)' });
  const c = fingerprint({ message: 'Other', stack: '' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
