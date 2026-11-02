// In-memory cache for the ladder: the rated games, the player rows and the
// computed ratings per division; also the statistics page data
// (routes/player-stats.js). Rating every game since the first event on
// each event page / ladder load is the slow part, and the data only changes
// when someone writes something.
//
// One cache per database handle (a WeakMap, so tests with their own mock db
// never share one). app.js drops it after every successful write request;
// the TTL covers changes made outside this process (scripts, psql) and the
// moving "last 365 days" window.

export const LADDER_CACHE_TTL_MS = 5 * 60 * 1000;

const caches = new WeakMap();
// Loaders seen per database handle, to refill the cache after a write.
const loaders = new WeakMap();
export const WARM_DELAY_MS = 2000;
const WARM_RECENT_MS = 15 * 60 * 1000;
const WARM_MAX_KEYS = 12;

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
  if (!loaders.has(db)) loaders.set(db, new Map());
  loaders.get(db).set(key, { load, usedAt: now });
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

/**
 * Refills the cache for the keys used in the last 15 minutes (ladder
 * divisions, statistics scopes), in the background, so the next visitor
 * does not wait for every rating to be recomputed. Returns the keys.
 */
export async function warmLadder(db, now = Date.now()) {
  const recent = [...(loaders.get(db) || new Map())]
    .filter(([, v]) => now - v.usedAt <= WARM_RECENT_MS)
    .sort((a, b) => b[1].usedAt - a[1].usedAt)
    .slice(0, WARM_MAX_KEYS);
  for (const [key, { load, usedAt }] of recent) {
    await cached(db, key, load, now).catch(() => {});
    loaders.get(db).set(key, { load, usedAt }); // warming is not a use
  }
  return recent.map(([key]) => key);
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Writes that never move ratings, statistics or the event pages' ladder
// data. Some run on every page load (touch, push re-subscribe), so letting
// them drop the cache would make every visit recompute all ratings.
export const CACHE_NEUTRAL_ROUTES = new Set([
  'POST /players/:id/touch',
  'POST /push/subscribe',
  'DELETE /push/unsubscribe',
  'POST /players/:id/key',
  'DELETE /players/:id/key',
  'POST /tournaments/:id/vote',
  'DELETE /tournaments/:id/vote',
  'POST /tournaments/:id/custom-vote',
  'DELETE /tournaments/:id/custom-vote',
  'POST /tournaments/:id/checkin',
  'DELETE /tournaments/:id/checkin',
  'POST /tournaments/:id/overlay-state',
  'POST /tournaments/:id/active-match',
  'POST /tournaments/:id/matches/:matchId/report/dispute',
  'DELETE /tournaments/:id/matches/:matchId/report',
]);

/** Whether a finished request may have changed what the cache holds. */
export function dropsCache(method, routeUrl, statusCode) {
  if (READ_METHODS.has(method)) return false;
  // Rejected writes (4xx) changed nothing; a 5xx may have got part way.
  if (statusCode >= 400 && statusCode < 500) return false;
  // Routes are registered under /api; compare without the prefix.
  const path = String(routeUrl || '').replace(/^\/api(?=\/)/, '');
  return !CACHE_NEUTRAL_ROUTES.has(`${method} ${path}`);
}

// Results, players, merges, event dates / modes: anything else written
// through the API can move ratings, so it drops the cache.
export function registerLadderCacheInvalidation(fastify) {
  let timer = null;
  fastify.addHook('onResponse', async (req, reply) => {
    if (!dropsCache(req.method, req.routeOptions?.url, reply.statusCode)) return;
    invalidateLadder(fastify.db);
    // A burst of writes (a round of results) refills once, shortly after.
    clearTimeout(timer);
    timer = setTimeout(() => {
      warmLadder(fastify.db).catch((err) => fastify.log.error({ err }, 'warming the ladder cache failed'));
    }, WARM_DELAY_MS);
    timer.unref?.();
  });
  fastify.addHook('onClose', async () => clearTimeout(timer));
}
