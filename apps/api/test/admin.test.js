import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminConfigured, isAdminRequest, requireAdmin, requireSelfOrAdmin, requireMatchPlayerOrAdmin } from '../lib/admin.js';
import { hashPlayerKey, newPlayerKey, playerKeyMatches } from '../lib/player-key.js';

function fakeFastify() {
  const audits = [];
  return {
    audits,
    httpErrors: {
      serviceUnavailable: (message) => Object.assign(new Error(message), { statusCode: 503 }),
      unauthorized: (message) => Object.assign(new Error(message), { statusCode: 401 }),
      forbidden: (message) => Object.assign(new Error(message), { statusCode: 403 })
    },
    esLogger: { audit: (doc) => audits.push(doc) }
  };
}

function req(headers = {}) {
  return { method: 'DELETE', url: '/api/players/x', headers, ip: '127.0.0.1' };
}

test('admin token is disabled when ADMIN_TOKEN is empty', () => {
  delete process.env.ADMIN_TOKEN;
  assert.equal(isAdminConfigured(), false);
  assert.equal(isAdminRequest(req({ 'x-admin-token': 'anything' })), false);
});

test('admin token must match exactly', () => {
  process.env.ADMIN_TOKEN = 'correct-horse';
  assert.equal(isAdminConfigured(), true);
  assert.equal(isAdminRequest(req({ 'x-admin-token': 'correct-horse' })), true);
  assert.equal(isAdminRequest(req({ 'x-admin-token': 'wrong' })), false);
  assert.equal(isAdminRequest(req({})), false);
  delete process.env.ADMIN_TOKEN;
});

test('requireAdmin fails closed with 503 when not configured', () => {
  delete process.env.ADMIN_TOKEN;
  const fastify = fakeFastify();
  assert.throws(
    () => requireAdmin(fastify, req({ 'x-admin-token': 'x' })),
    (err) => err.statusCode === 503
  );
  assert.equal(fastify.audits.at(-1).action, 'admin.not_configured');
});

test('requireAdmin rejects bad tokens and audits the denial', () => {
  process.env.ADMIN_TOKEN = 'correct-horse';
  const fastify = fakeFastify();
  assert.throws(
    () => requireAdmin(fastify, req({ 'x-admin-token': 'nope' })),
    (err) => err.statusCode === 401
  );
  assert.equal(fastify.audits.at(-1).action, 'admin.denied');
  delete process.env.ADMIN_TOKEN;
});

test('requireAdmin accepts the configured token and audits success', () => {
  process.env.ADMIN_TOKEN = 'correct-horse';
  const fastify = fakeFastify();
  assert.doesNotThrow(() =>
    requireAdmin(
      fastify,
      req({ 'x-admin-token': 'correct-horse', 'x-player-id': encodeURIComponent('小明') })
    )
  );
  const audit = fastify.audits.at(-1);
  assert.equal(audit.action, 'admin.authorized');
  assert.equal(audit.playerId, '小明');
  delete process.env.ADMIN_TOKEN;
});

// A fake db: player_keys rows keyed by player id.
function fakeDb(keys = {}) {
  return {
    query: async (_sql, [id]) => ({ rows: keys[id] ? [{ key_hash: keys[id] }] : [] }),
  };
}

test('requireSelfOrAdmin allows the matching player id', async () => {
  delete process.env.ADMIN_TOKEN;
  const fastify = fakeFastify();
  await assert.doesNotReject(
    requireSelfOrAdmin(fastify, req({ 'x-player-id': encodeURIComponent('小明') }), '小明')
  );
  assert.equal(fastify.audits.at(-1).action, 'auth.self');
});

test('requireSelfOrAdmin allows an admin acting for another player', async () => {
  process.env.ADMIN_TOKEN = 'correct-horse';
  const fastify = fakeFastify();
  await assert.doesNotReject(
    requireSelfOrAdmin(fastify, req({ 'x-admin-token': 'correct-horse' }), '小明')
  );
  assert.equal(fastify.audits.at(-1).action, 'admin.authorized');
  delete process.env.ADMIN_TOKEN;
});

test('requireSelfOrAdmin rejects other players with 403', async () => {
  delete process.env.ADMIN_TOKEN;
  const fastify = fakeFastify();
  await assert.rejects(
    requireSelfOrAdmin(fastify, req({ 'x-player-id': 'intruder' }), '小明'),
    (err) => err.statusCode === 403
  );
  assert.equal(fastify.audits.at(-1).action, 'auth.denied');
  await assert.rejects(requireSelfOrAdmin(fastify, req(), '小明'), (err) => err.statusCode === 403);
});

test('a bound player ID needs its device key', async () => {
  delete process.env.ADMIN_TOKEN;
  const key = newPlayerKey();
  const fastify = { ...fakeFastify(), db: fakeDb({ alice: hashPlayerKey(key) }) };
  await assert.rejects(
    requireSelfOrAdmin(fastify, req({ 'x-player-id': 'alice' }), 'alice'),
    (err) => err.statusCode === 403 && err.code === 'PLAYER_KEY_REQUIRED'
  );
  await assert.rejects(
    requireSelfOrAdmin(fastify, req({ 'x-player-id': 'alice', 'x-player-key': 'wrong' }), 'alice'),
    (err) => err.code === 'PLAYER_KEY_REQUIRED'
  );
  await assert.doesNotReject(
    requireSelfOrAdmin(fastify, req({ 'x-player-id': 'alice', 'x-player-key': key }), 'alice')
  );
  // Unbound IDs still work without a key.
  await assert.doesNotReject(requireSelfOrAdmin(fastify, req({ 'x-player-id': 'bob' }), 'bob'));
  // So do match results.
  const match = { player1_id: 'alice', player2_id: 'bob' };
  await assert.rejects(
    requireMatchPlayerOrAdmin(fastify, req({ 'x-player-id': 'alice' }), match),
    (err) => err.code === 'PLAYER_KEY_REQUIRED'
  );
  await assert.doesNotReject(
    requireMatchPlayerOrAdmin(fastify, req({ 'x-player-id': 'alice', 'x-player-key': key }), match)
  );
});

test('player keys: random, stored as a hash, compared exactly', () => {
  const a = newPlayerKey();
  assert.notEqual(a, newPlayerKey());
  assert.ok(a.length >= 32);
  assert.equal(playerKeyMatches(a, hashPlayerKey(a)), true);
  assert.equal(playerKeyMatches(a + 'x', hashPlayerKey(a)), false);
  assert.equal(playerKeyMatches('', hashPlayerKey(a)), false);
  assert.equal(playerKeyMatches(a, null), false);
});

test('requireMatchPlayerOrAdmin allows both match participants', async () => {
  delete process.env.ADMIN_TOKEN;
  const fastify = fakeFastify();
  const match = { player1_id: 'alice', player2_id: 'bob' };
  await assert.doesNotReject(requireMatchPlayerOrAdmin(fastify, req({ 'x-player-id': 'alice' }), match));
  assert.equal(fastify.audits.at(-1).action, 'auth.match_player');
  await assert.doesNotReject(requireMatchPlayerOrAdmin(fastify, req({ 'x-player-id': 'bob' }), match));
});

test('requireMatchPlayerOrAdmin allows an admin and rejects outsiders', async () => {
  process.env.ADMIN_TOKEN = 'correct-horse';
  const fastify = fakeFastify();
  const match = { player1_id: 'alice', player2_id: 'bob' };
  await assert.doesNotReject(
    requireMatchPlayerOrAdmin(fastify, req({ 'x-admin-token': 'correct-horse' }), match)
  );
  assert.equal(fastify.audits.at(-1).action, 'admin.authorized');
  delete process.env.ADMIN_TOKEN;
  await assert.rejects(
    requireMatchPlayerOrAdmin(fastify, req({ 'x-player-id': 'carol' }), match),
    (err) => err.statusCode === 403
  );
  assert.equal(fastify.audits.at(-1).action, 'auth.denied');
});
