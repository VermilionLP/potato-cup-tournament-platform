// Runs `fn(client)` inside BEGIN / COMMIT on a pooled client; rolls back
// and rethrows on error, and always releases the client.
export async function inTransaction(db, fn) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
