import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheControlFor, staticCacheHeaders } from '../lib/static-cache.js';

test('hashed build files are cached for a year, pages are revalidated', () => {
  const build = '/home/admin/suck/apps/web/build';
  assert.match(cacheControlFor(`${build}/_app/immutable/chunks/abc123.js`), /max-age=31536000, immutable/);
  assert.match(cacheControlFor(`${build}/_app/immutable/assets/0.css.br`), /immutable/);
  assert.equal(cacheControlFor(`${build}/index.html`), 'no-cache');
  assert.equal(cacheControlFor(`${build}/index.html.gz`), 'no-cache');
  assert.equal(cacheControlFor(`${build}/sw.js`), 'no-cache');
  assert.equal(cacheControlFor(`${build}/_app/version.json`), 'no-cache');
  assert.match(cacheControlFor(`${build}/flags/cn.svg`), /max-age=86400/);
});

test('headers set on the response', () => {
  const headers = {};
  staticCacheHeaders({ setHeader: (k, v) => (headers[k] = v) }, '/x/_app/immutable/a.js.br');
  assert.match(headers['Cache-Control'], /immutable/);
  assert.equal(headers.Vary, 'Accept-Encoding');
});

test('headers set through a Fastify reply (@fastify/static 10)', () => {
  const headers = {};
  const reply = { header(k, v) { headers[k] = v; return this; } };
  staticCacheHeaders(reply, '/x/index.html');
  assert.equal(headers['Cache-Control'], 'no-cache');
  assert.equal(headers.Vary, 'Accept-Encoding');
});
