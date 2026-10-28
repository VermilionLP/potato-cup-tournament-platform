// In-memory cache for the ladder: the rated games, the player rows and the
// computed ratings per division. Rating every game since the first event on
// each event page / ladder load is the slow part, and the data only changes
// when someone writes something.
//
// One cache per database handle (a WeakMap, so tests with their own mock db
// never share one). app.js drops it after every successful write request;
// the TTL covers changes made outside this process (scripts, psql) and the
// moving "last 365 days" window.

export const LADDER_CACHE_TTL_MS = 5 * 60 * 1000;

const caches = new WeakMap();

function freshStore(now) {
  return { createdAt: now, entries: new Map() };
}

function storeFor(db, now) {
  let store = caches.get(db);
  if (!store || now - store.createdAt >= LADDER_CACHE_TTL_MS) {
    store = freshStore(now);
    caches.set(db, store);
  }
  return store;
}

/**
 * The cached value for `key`, or `load()`'s. Concurrent callers share one
 * load; a failed load isn't kept. A load that finishes after the cache was
 * dropped lands in the old store, so it can't bring stale data back.
 */
export function cached(db, key, load, now = Date.now()) {
  const store = storeFor(db, now);
  if (store.entries.has(key)) return store.entries.get(key);
  const pending = Promise.resolve().then(load);
  store.entries.set(key, pending);
  pending.catch(() => {
    if (store.entries.get(key) === pending) store.entries.delete(key);
  });
  return pending;
}

export function invalidateLadder(db) {
  caches.delete(db);
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Results, players, merges, event dates / modes: anything written through
// the API can move ratings, so any successful write drops the cache.
export function registerLadderCacheInvalidation(fastify) {
  fastify.addHook('onResponse', async (req, reply) => {
    // Rejected writes (4xx) changed nothing; a 5xx may have got part way.
    const rejected = reply.statusCode >= 400 && reply.statusCode < 500;
    if (!READ_METHODS.has(req.method) && !rejected) invalidateLadder(fastify.db);
  });
}
