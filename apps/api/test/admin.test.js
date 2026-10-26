import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminConfigured, isAdminRequest, requireAdmin, requireSelfOrAdmin, requireMatchPlayerOrAdmin } from '../lib/admin.js';

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

test('requireSelfOrAdmin allows the matching player id', () => {
  delete process.env.ADMIN_TOKEN;
  const fastify = fakeFastify();
  assert.doesNotThrow(() =>
    requireSelfOrAdmin(
      fastify,
      req({ 'x-player-id': encodeURIComponent('小明') }),
      '小明'
    )
  );
  assert.equal(fastify.audits.at(-1).action, 'auth.self');
});

test('requireSelfOrAdmin allows an admin acting for another player', () => {
  process.env.ADMIN_TOKEN = 'correct-horse';
  const fastify = fakeFastify();
  assert.doesNotThrow(() =>
    requireSelfOrAdmin(fastify, req({ 'x-admin-token': 'correct-horse' }), '小明')
  );
  assert.equal(fastify.audits.at(-1).action, 'admin.authorized');
  delete process.env.ADMIN_TOKEN;
});

test('requireSelfOrAdmin rejects other players with 403', () => {
  delete process.env.ADMIN_TOKEN;
  const fastify = fakeFastify();
  assert.throws(
    () =>
      requireSelfOrAdmin(fastify, req({ 'x-player-id': 'intruder' }), '小明'),
    (err) => err.statusCode === 403
  );
  assert.equal(fastify.audits.at(-1).action, 'auth.denied');

  assert.throws(() => requireSelfOrAdmin(fastify, req(), '小明'), (err) => err.statusCode === 403);
});

test('requireMatchPlayerOrAdmin allows both match participants', () => {
  delete process.env.ADMIN_TOKEN;
  const fastify = fakeFastify();
  const match = { player1_id: 'alice', player2_id: 'bob' };
  assert.doesNotThrow(() =>
    requireMatchPlayerOrAdmin(fastify, req({ 'x-player-id': 'alice' }), match)
  );
  assert.equal(fastify.audits.at(-1).action, 'auth.match_player');
  assert.doesNotThrow(() =>
    requireMatchPlayerOrAdmin(fastify, req({ 'x-player-id': 'bob' }), match)
  );
});

test('requireMatchPlayerOrAdmin allows an admin and rejects outsiders', () => {
  process.env.ADMIN_TOKEN = 'correct-horse';
  const fastify = fakeFastify();
  const match = { player1_id: 'alice', player2_id: 'bob' };
  assert.doesNotThrow(() =>
    requireMatchPlayerOrAdmin(fastify, req({ 'x-admin-token': 'correct-horse' }), match)
  );
  assert.equal(fastify.audits.at(-1).action, 'admin.authorized');
  delete process.env.ADMIN_TOKEN;

  assert.throws(
    () =>
      requireMatchPlayerOrAdmin(fastify, req({ 'x-player-id': 'carol' }), match),
    (err) => err.statusCode === 403
  );
  assert.equal(fastify.audits.at(-1).action, 'auth.denied');
});
