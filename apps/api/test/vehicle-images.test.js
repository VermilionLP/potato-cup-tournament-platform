import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageSource, vehicleImageStore } from '../lib/vehicle-images.js';

test('only wiki slot images and flags, with safe names', () => {
  assert.deepEqual(imageSource('slots', 'p-47d-28.png'), { url: 'https://static.encyclopedia.warthunder.com/slots/p-47d-28.png', file: 'slots/p-47d-28.png' });
  assert.equal(imageSource('images', 'p-39n.png').url, 'https://static.encyclopedia.warthunder.com/images/p-39n.png');
  assert.equal(imageSource('country', 'usa.png').url, 'https://static.encyclopedia.warthunder.com/unit_tooltip/country_usa.png');
  for (const [kind, file] of [['slots', '../etc/passwd.png'], ['slots', 'a/b.png'], ['slots', 'x.svg'], ['other', 'x.png'], ['country', 'u-s.png']]) {
    assert.equal(imageSource(kind, file), null, `${kind}/${file}`);
  }
});

test('downloads once, serves from disk, remembers misses for an hour', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vimg-'));
  const calls = [];
  let t = 0;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('missing')) return { ok: false, status: 404 };
    return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => png };
  };
  const store = vehicleImageStore({ dir, fetchImpl, now: () => t });
  const [a, b] = await Promise.all([store.get('slots', 'p-47d-28.png'), store.get('slots', 'p-47d-28.png')]);
  assert.deepEqual([a, b], [png, png]);
  assert.equal(calls.length, 1, 'concurrent requests share one download');
  assert.deepEqual(await readFile(join(dir, 'slots/p-47d-28.png')), png);
  assert.deepEqual(await store.get('slots', 'p-47d-28.png'), png);
  assert.equal(calls.length, 1, 'then from disk');
  assert.equal(await store.get('slots', 'missing.png'), null);
  assert.equal(await store.get('slots', 'missing.png'), null);
  assert.equal(calls.length, 2, 'a miss is not retried within the hour');
  t = 61 * 60 * 1000;
  await store.get('slots', 'missing.png');
  assert.equal(calls.length, 3);
});
