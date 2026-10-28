import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LADDER_CACHE_TTL_MS,
  cached,
  invalidateLadder,
  registerLadderCacheInvalidation,
} from '../lib/ladder-cache.js';
import { LadderRepo } from '../repositories/ladder-repo.js';

function countingDb(games) {
  const counts = { games: 0, players: 0 };
  const db = {
    async query(sql) {
      const text = String(sql).trim();
      if (text.includes('FROM axsuck.matches m')) {
        counts.games += 1;
        return { rows: games };
      }
      if (text.startsWith('SELECT id, flag, team FROM axsuck.players')) {
        counts.players += 1;
        return { rows: [] };
      }
      if (text.startsWith('SELECT game_mode, vehicle_pool FROM axsuck.tournaments')) {
        return { rows: [{ game_mode: '', vehicle_pool: '' }] };
      }
      throw new Error(`unexpected SQL: ${text}`);
    },
  };
  return { db, counts };
}

const games = [
  { id: 1, tournament_id: 't1', player1_id: 'p1', player2_id: 'p2', score1: 2, score2: 0, played_at: '2026-01-10T20:00:00+08:00' },
  { id: 2, tournament_id: 't1', player1_id: 'p2', player2_id: 'p3', score1: 2, score2: 1, played_at: '2026-01-10T21:00:00+08:00' },
];

test('ladder reads share one load and one computation until a write', async () => {
  const { db, counts } = countingDb(games);
  const repo = LadderRepo(db);
  const [a, b] = await Promise.all([repo.leaderboard(), repo.leaderboard()]);
  await repo.eventRatings({});
  await repo.playerDetail('p1');
  assert.deepEqual(counts, { games: 1, players: 1 });
  assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
  assert.notEqual(a[0], b[0], 'callers get their own objects');

  // Another division is rated separately, from the same loaded games.
  await repo.leaderboard({ mode: 'ab' });
  assert.deepEqual(counts, { games: 1, players: 1 });

  invalidateLadder(db);
  games.push({ id: 3, tournament_id: 't2', player1_id: 'p3', player2_id: 'p1', score1: 2, score2: 0, played_at: '2026-02-10T20:00:00+08:00' });
  const after = await repo.playerDetail('p3');
  assert.deepEqual(counts, { games: 2, players: 2 });
  assert.equal(after.games, 2);
});

test('a caller changing its result does not change the cache', async () => {
  const { db } = countingDb(games);
  const repo = LadderRepo(db);
  const first = await repo.leaderboard({ includeInactive: true });
  first[0].mmr = -1;
  first.length = 0;
  const second = await repo.leaderboard({ includeInactive: true });
  assert.ok(second.length > 0);
  assert.ok(second.every((p) => p.mmr !== -1));
});

test('cache expires after the TTL and failed loads are retried', async () => {
  const db = {};
  let loads = 0;
  const load = async () => ++loads;
  assert.equal(await cached(db, 'k', load, 0), 1);
  assert.equal(await cached(db, 'k', load, LADDER_CACHE_TTL_MS - 1), 1);
  assert.equal(await cached(db, 'k', load, LADDER_CACHE_TTL_MS), 2);

  let fail = true;
  const flaky = async () => {
    if (fail) throw new Error('db down');
    return 'ok';
  };
  await assert.rejects(cached(db, 'f', flaky, LADDER_CACHE_TTL_MS));
  fail = false;
  assert.equal(await cached(db, 'f', flaky, LADDER_CACHE_TTL_MS), 'ok');
});

test('a load that finishes after a write does not bring old data back', async () => {
  const db = {};
  let release;
  const slow = cached(db, 'k', () => new Promise((r) => { release = r; }));
  await Promise.resolve();
  invalidateLadder(db);
  release('old');
  assert.equal(await slow, 'old');
  assert.equal(await cached(db, 'k', async () => 'new'), 'new');
});

test('successful and failed-midway writes drop the cache; reads and rejected writes keep it', async () => {
  let hook;
  const fastify = { db: {}, addHook: (name, fn) => { assert.equal(name, 'onResponse'); hook = fn; } };
  registerLadderCacheInvalidation(fastify);
  const kept = async () => (await cached(fastify.db, 'k', async () => Symbol('v')));

  const v = await kept();
  await hook({ method: 'GET' }, { statusCode: 200 });
  await hook({ method: 'POST' }, { statusCode: 403 });
  assert.equal(await kept(), v);

  for (const [method, statusCode] of [['POST', 200], ['PATCH', 204], ['DELETE', 500]]) {
    const before = await kept();
    await hook({ method }, { statusCode });
    assert.notEqual(await kept(), before, `${method} ${statusCode}`);
  }
});
