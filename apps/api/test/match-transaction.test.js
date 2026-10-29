import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inTransaction } from '../lib/transaction.js';
import { MatchRepo } from '../repositories/match-repo.js';

function fakeDb() {
  const log = [];
  const client = { query: async (sql) => { log.push(String(sql).trim().split(/\s+/)[0]); return { rows: [] }; }, release: () => log.push('release') };
  return { log, db: { connect: async () => client, query: client.query } };
}

test('transactions commit, or roll back and rethrow; the client is always released', async () => {
  const ok = fakeDb();
  assert.equal(await inTransaction(ok.db, async (c) => { await c.query('SELECT 1'); return 7; }), 7);
  assert.deepEqual(ok.log, ['BEGIN', 'SELECT', 'COMMIT', 'release']);

  const bad = fakeDb();
  await assert.rejects(inTransaction(bad.db, async () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(bad.log, ['BEGIN', 'ROLLBACK', 'release']);
});

test('MatchRepo keeps its methods', () => {
  assert.deepEqual(Object.keys(MatchRepo(fakeDb().db)).sort(), [
    'advanceSwiss', 'advanceWinner', 'clearMatches', 'clearPlayoffs', 'create', 'generateBracket',
    'generatePlayoffs', 'getById', 'getByTournament', 'submitResult',
  ]);
});
