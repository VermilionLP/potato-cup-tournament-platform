import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoutes, fakeDb, sampleUrl } from './helpers/route-harness.js';
import { hashPlayerKey } from '../lib/player-key.js';

// Route modules as app.js registers them. push.js needs web-push (via the
// scheduler it does not import), so all load without the npm packages.
const MODULE_FILES = [
  'tournaments', 'tournament-settings', 'tournament-bracket', 'tournament-import', 'players',
  'player-keys', 'player-stats', 'registrations', 'matches', 'votes', 'ladder', 'wiki', 'push',
  'admin', 'vehicle-pools', 'points', 'client-errors',
];
const modules = await Promise.all(MODULE_FILES.map(async (f) => (await import(`../routes/${f}.js`)).default));

const ADMIN = { 'x-admin-token': 'test-admin-token' };
const player = (id, key) => ({ 'x-player-id': id, ...(key ? { 'x-player-key': key } : {}) });
process.env.ADMIN_TOKEN = ADMIN['x-admin-token'];

// Writes anyone may make without an identity.
const PUBLIC_WRITES = new Set(['POST /push/subscribe', 'DELETE /push/unsubscribe', 'POST /client-errors']);
// Writes a player may make for themselves (checked separately below).
const SELF_WRITES = new Set([
  'POST /players', 'POST /players/:id/touch', 'POST /players/:id/key',
  'POST /tournaments/:id/register', 'DELETE /tournaments/:id/register',
  'POST /tournaments/:id/vote', 'DELETE /tournaments/:id/vote',
  'POST /tournaments/:id/matches/:matchId/result', 'POST /tournaments/:id/matches/:matchId/walkover',
  'POST /tournaments/:id/checkin', 'DELETE /tournaments/:id/checkin',
  'POST /tournaments/:id/matches/:matchId/report/confirm', 'POST /tournaments/:id/matches/:matchId/report/dispute',
  'DELETE /tournaments/:id/matches/:matchId/report',
]);
// Reads only admins may make.
const ADMIN_READS = ['GET /players/:id/key', 'GET /players/duplicates', 'GET /tournaments/:id/wiki', 'GET /client-errors'];
const body = { player_id: 'p1', id: 'p1', score1: 2, score2: 0, winner_id: 'p1', newId: 'p9', targetId: 'p2', name: 'X', battle_tags: { qq: '123456' } };

test('every write needs an identity; a request without one writes nothing', async () => {
  const db = fakeDb();
  const { routes, inject } = await buildRoutes(modules, db);
  const writes = routes.filter((r) => r.method !== 'GET' && !PUBLIC_WRITES.has(`${r.method} ${r.path}`));
  assert.ok(writes.length > 40, `found ${writes.length} write routes`);
  for (const r of writes) {
    const before = db.writes.length;
    const res = await inject({ method: r.method, url: sampleUrl(r.path), body });
    assert.ok(res.statusCode >= 400, `${r.method} ${r.path} answered ${res.statusCode}`);
    assert.equal(db.writes.length, before, `${r.method} ${r.path} wrote ${db.writes.slice(before)}`);
  }
});

test('admin-only routes refuse a signed-in player and accept the admin token', async () => {
  const db = fakeDb();
  const { routes, inject } = await buildRoutes(modules, db);
  const adminOnly = routes.filter((r) => (r.method !== 'GET' && !SELF_WRITES.has(`${r.method} ${r.path}`) && !PUBLIC_WRITES.has(`${r.method} ${r.path}`))
    || ADMIN_READS.includes(`${r.method} ${r.path}`));
  for (const r of adminOnly) {
    const before = db.writes.length;
    const asPlayer = await inject({ method: r.method, url: sampleUrl(r.path), headers: player('p1'), body });
    assert.equal(asPlayer.statusCode, 401, `${r.method} ${r.path} as a player: ${asPlayer.statusCode} ${asPlayer.error?.message}`);
    assert.equal(db.writes.length, before, `${r.method} ${r.path} wrote as a player`);
    const asAdmin = await inject({ method: r.method, url: sampleUrl(r.path), headers: ADMIN, body });
    assert.notEqual(asAdmin.statusCode, 401, `${r.method} ${r.path} refused the admin`);
    assert.notEqual(asAdmin.statusCode, 403, `${r.method} ${r.path} refused the admin`);
  }
});

test('admin access is off when no token is configured', async () => {
  const saved = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = '';
  try {
    const { inject } = await buildRoutes(modules, fakeDb());
    const res = await inject({ method: 'DELETE', url: '/tournaments/t1', headers: { 'x-admin-token': '' } });
    assert.equal(res.statusCode, 503);
    const forged = await inject({ method: 'DELETE', url: '/tournaments/t1', headers: { 'x-admin-token': 'anything' } });
    assert.equal(forged.statusCode, 503);
  } finally {
    process.env.ADMIN_TOKEN = saved;
  }
});

test('players act only for themselves, with their device key once bound', async () => {
  const db = fakeDb({ keys: { p3: hashPlayerKey('secret') } });
  const { inject } = await buildRoutes(modules, db);
  const register = (headers, id) => inject({ method: 'POST', url: '/tournaments/t1/register', headers, body: { player_id: id } });

  assert.equal((await register(player('p1'), 'p2')).statusCode, 403, 'not for someone else');
  assert.equal((await register({}, 'p1')).statusCode, 403, 'not without an identity');
  const own = await register(player('p1'), 'p1');
  assert.ok(![401, 403].includes(own.statusCode), `own registration: ${own.statusCode} ${own.error?.message}`);

  const bound = await register(player('p3'), 'p3');
  assert.equal(bound.statusCode, 403);
  assert.equal(bound.error.code, 'PLAYER_KEY_REQUIRED');
  const withKey = await register(player('p3', 'secret'), 'p3');
  assert.ok(![401, 403].includes(withKey.statusCode), `with the key: ${withKey.statusCode}`);
  assert.equal((await register(player('p3', 'wrong'), 'p3')).statusCode, 403);

  const vote = await inject({ method: 'POST', url: '/tournaments/t1/vote', headers: player('p1'), body: { player_id: 'p2', proposed_time: '2026-11-01T20:00' } });
  assert.equal(vote.statusCode, 403, 'no voting for someone else');
  const profile = await inject({ method: 'POST', url: '/players', headers: player('p1'), body: { id: 'p2', battle_tags: { qq: '123456' } } });
  assert.equal(profile.statusCode, 403, "no editing someone else's profile");
  const key = await inject({ method: 'POST', url: '/players/p2/key', headers: player('p1') });
  assert.equal(key.statusCode, 403, "no binding someone else's ID");
});

test('only the two players (or an admin) report a match result', async () => {
  const db = fakeDb({ row: { player1_id: 'p1', player2_id: 'p2', status: 'pending' } });
  const { inject } = await buildRoutes(modules, db);
  const report = (headers) => inject({ method: 'POST', url: '/tournaments/t1/matches/1/result', headers, body: { score1: 2, score2: 0 } });
  for (const headers of [{}, player('p3')]) {
    const before = db.writes.length;
    assert.equal((await report(headers)).statusCode, 403);
    assert.equal(db.writes.length, before);
  }
  for (const headers of [player('p1'), player('p2'), ADMIN]) {
    const res = await report(headers);
    assert.ok(![401, 403].includes(res.statusCode), `${JSON.stringify(headers)}: ${res.statusCode} ${res.error?.message}`);
  }
  const walkover = await inject({ method: 'POST', url: '/tournaments/t1/matches/1/walkover', headers: player('p3'), body: { winner_id: 'p3' } });
  assert.equal(walkover.statusCode, 403);
});

test("a player's score waits for the opponent; only the opponent confirms it", async () => {
  const pending = { kind: 'score', by: 'p1', score1: 2, score2: 0, at: new Date().toISOString(), disputed: false, counter: null };
  const db = fakeDb({ row: { player1_id: 'p1', player2_id: 'p2', status: 'pending', pending_report: pending } });
  const { inject } = await buildRoutes(modules, db);
  const confirm = (headers) => inject({ method: 'POST', url: '/tournaments/t1/matches/1/report/confirm', headers, body: {} });
  for (const headers of [{}, player('p3'), player('p1')]) {
    const before = db.writes.length;
    assert.equal((await confirm(headers)).statusCode, 403, `confirm as ${JSON.stringify(headers)}`);
    assert.equal(db.writes.length, before);
  }
  const before = db.writes.length;
  const byOpponent = await confirm(player('p2'));
  assert.ok(![401, 403].includes(byOpponent.statusCode), `opponent: ${byOpponent.statusCode} ${byOpponent.error?.message}`);
  assert.ok(db.writes.length > before, 'the confirmed score was written');

  const dispute = await inject({ method: 'POST', url: '/tournaments/t1/matches/1/report/dispute', headers: player('p1'), body: {} });
  assert.equal(dispute.statusCode, 403, 'the reporter cannot dispute their own report');
  const withdraw = await inject({ method: 'DELETE', url: '/tournaments/t1/matches/1/report', headers: player('p2'), body: {} });
  assert.equal(withdraw.statusCode, 403, "the opponent cannot withdraw someone else's report");
});

test('a walkover claim by a player is never confirmed by the opponent', async () => {
  const pending = { kind: 'walkover', by: 'p1', winner_id: 'p1', at: new Date().toISOString(), disputed: false, counter: null };
  const db = fakeDb({ row: { player1_id: 'p1', player2_id: 'p2', status: 'pending', pending_report: pending } });
  const { inject } = await buildRoutes(modules, db);
  const res = await inject({ method: 'POST', url: '/tournaments/t1/matches/1/report/confirm', headers: player('p2'), body: {} });
  assert.equal(res.statusCode, 403);
  const admin = await inject({ method: 'POST', url: '/tournaments/t1/matches/1/report/confirm', headers: ADMIN, body: {} });
  assert.ok(![401, 403].includes(admin.statusCode), `admin: ${admin.statusCode} ${admin.error?.message}`);
});

test('player IP addresses are shown to admins only', async () => {
  const { inject } = await buildRoutes(modules, fakeDb({ row: { last_ip: '1.2.3.4', display_name: 'P1', battle_tags: {} } }));
  for (const url of ['/players', '/players/p1']) {
    const guest = await inject({ method: 'GET', url });
    const admin = await inject({ method: 'GET', url, headers: ADMIN });
    const one = (r) => (Array.isArray(r.payload) ? r.payload[0] : r.payload);
    assert.equal(guest.statusCode, 200, url);
    assert.equal(one(guest).last_ip, undefined, `${url}: no IP for guests`);
    assert.equal(one(admin).last_ip, '1.2.3.4', `${url}: admins see it`);
  }
});

test('an event page reads its own vehicle pool', async () => {
  const { inject } = await buildRoutes(modules, fakeDb({ row: { event_type: 'prop', vehicles: [{ name: 'P-47D-28', group: 'USA' }], game_modes: [] } }));
  const res = await inject({ method: 'GET', url: '/tournaments/t1/vehicle-pool' });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.payload.template.vehicles[0].unit), /^p-47d/, 'unit filled in from the bundled index');
});
