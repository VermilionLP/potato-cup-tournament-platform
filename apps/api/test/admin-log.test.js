import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIONS, actionOf, cleanDetail } from '../lib/admin-log.js';

test('logged routes: admin writes, not the match-day controls', () => {
  assert.equal(actionOf('POST', '/api/tournaments/:id/matches/:matchId/result'), 'match.result');
  assert.equal(actionOf('patch', '/api/tournaments/:id'), 'event.settings');
  assert.equal(actionOf('POST', '/api/tournaments'), 'event.create');
  for (const route of ['active-match', 'countdown', 'overlay-state', 'bracket']) {
    assert.equal(actionOf('POST', `/api/tournaments/:id/${route}`), null, route);
  }
  assert.equal(actionOf('POST', '/api/tournaments/:id/matches/:matchId/live-score'), null);
  assert.equal(actionOf('POST', '/api/tournaments/:id/matches/:matchId/banpick'), null);
  assert.equal(actionOf('GET', '/api/tournaments/:id'), null);
  assert.ok(Object.values(ACTIONS).every((a) => /^[a-z]+\.[a-z_]+$/.test(a)));
});

test('details: secrets dropped, long text cut, pool vehicles counted', () => {
  const d = cleanDetail({
    score1: 2,
    token: 'x',
    adminToken: 'x',
    player_key: 'x',
    key: 'main:1',
    description: 'a'.repeat(1000),
    vehicles: [1, 2, 3],
    nested: { password: 'p', ok: true },
  });
  assert.equal(d.score1, 2);
  assert.equal(d.key, 'main:1');
  assert.ok(!('token' in d) && !('adminToken' in d) && !('player_key' in d));
  assert.equal(d.description.length, 301);
  assert.equal(d.vehicle_count, 3);
  assert.deepEqual(d.nested, { ok: true });
});

test('every logged route exists', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const dir = new URL('../routes/', import.meta.url);
  const routes = new Set();
  for (const f of await readdir(dir)) {
    const src = await readFile(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/fastify\.(get|post|put|patch|delete)\(['`]([^'`]+)['`]/g)) routes.add(`${m[1].toUpperCase()} ${m[2]}`);
  }
  for (const key of Object.keys(ACTIONS)) assert.ok(routes.has(key), `${key} is not a route`);
});
