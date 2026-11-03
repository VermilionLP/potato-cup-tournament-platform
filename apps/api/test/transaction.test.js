import test from 'node:test';
import assert from 'node:assert/strict';
import { inTransaction } from '../lib/transaction.js';

function fakePool() {
  const log = [];
  let connects = 0;
  const client = { query: async (sql) => log.push(sql), release: () => log.push('release') };
  return { log, connects: () => connects, pool: { connect: async () => (connects += 1, client) } };
}

test('commits, rolls back on error, and joins an outer transaction', async () => {
  const { pool, log, connects } = fakePool();
  const out = await inTransaction(pool, async (client) => {
    await client.query('A');
    // A nested call (e.g. the next Swiss round) uses the same client and transaction.
    return inTransaction(client, async (inner) => {
      assert.equal(inner, client);
      await inner.query('B');
      return 42;
    });
  });
  assert.equal(out, 42);
  assert.equal(connects(), 1);
  assert.deepEqual(log, ['BEGIN', 'A', 'B', 'COMMIT', 'release']);

  log.length = 0;
  await assert.rejects(inTransaction(pool, async (c) => { await c.query('X'); throw new Error('boom'); }), /boom/);
  assert.deepEqual(log, ['BEGIN', 'X', 'ROLLBACK', 'release']);
});
