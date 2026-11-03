// Shared by repositories and routes (match generation, player merges, seeds,
// results). Runs `fn(client)` inside BEGIN / COMMIT on a pooled client; rolls
// back and rethrows on error, and always releases the client. Called with a
// client that is already in a transaction (e.g. a result that creates the
// next Swiss round), it joins that transaction instead of opening another.

const IN_TRANSACTION = Symbol('inTransaction');

export async function inTransaction(db, fn) {
  if (db?.[IN_TRANSACTION]) return fn(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    client[IN_TRANSACTION] = true;
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    delete client[IN_TRANSACTION];
    client.release();
  }
}
