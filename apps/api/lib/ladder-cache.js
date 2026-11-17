// In-memory cache for the ladder: the rated games, the player rows and the
// computed ratings per division; also the statistics page data
// (routes/player-stats.js). Rating every game since the first event on
// each event page / ladder load is the slow part, and the data only changes
// when someone writes something.
//
// One cache per database handle (a WeakMap, so tests with their own mock db
// never share one). app.js drops it after every successful write request;
// the TTL covers changes made outside this process (scripts, psql) and the
// moving "last 365 days" window. When the TTL runs out, readers keep getting
// the previous value while the new one is computed (stale-while-revalidate),
// so no visitor waits for a recompute just because time passed; a write
// drops the cache outright, so nothing stale is served after one.

export const LADDER_CACHE_TTL_MS = 5 * 60 * 1000;

const caches = new WeakMap();
// Loaders seen per database handle, to refill the cache after a write.
const loaders = new WeakMap();
export const WARM_DELAY_MS = 2000;
const WARM_RECENT_MS = 15 * 60 * 1000;
const WARM_MAX_KEYS = 12;

// `entries`: key → promise; `done`: key → settled value; `stale`: the
// store the TTL just replaced, whose values are served while these load.
function freshStore(now, stale = null) {
  return { createdAt: now, entries: new Map(), done: new Map(), stale };
}

function storeFor(db, now) {
  let store = caches.get(db);
  if (!store || now - store.createdAt >= LADDER_CACHE_TTL_MS) {
    // Only a store that expired just now is worth serving (at most one TTL
    // past its end), and only one generation back is kept.
    const prev = store && now - store.createdAt < 2 * LADDER_CACHE_TTL_MS ? store : null;
    if (prev) prev.stale = null;
    store = freshStore(now, prev);
    caches.set(db, store);
  }
  return store;
}

/**
 * The cached value for `key`, or `load()`'s. Concurrent callers share one
 * load; a failed load isn't kept. A load that finishes after the cache was
 * dropped lands in the old store, so it can't bring stale data back. While
 * a load after the TTL runs, callers get the expired store's value if it
 * has one.
 */
export function cached(db, key, load, now = Date.now()) {
  if (!loaders.has(db)) loaders.set(db, new Map());
  loaders.get(db).set(key, { load, usedAt: now });
  const store = storeFor(db, now);
  if (!store.entries.has(key)) {
    const pending = Promise.resolve().then(load);
    store.entries.set(key, pending);
    pending.then(
      (value) => {
        if (store.entries.get(key) === pending) store.done.set(key, value);
      },
      () => {
        if (store.entries.get(key) === pending) store.entries.delete(key);
      },
    );
  }
  if (!store.done.has(key) && store.stale?.done.has(key)) {
    store.entries.get(key).catch(() => {}); // the next caller retries
    return Promise.resolve(store.stale.done.get(key));
  }
  return store.entries.get(key);
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
  // Spaded vehicles from Statshark (routes/vehicle-pools.js): Ban / Pick only.
  'POST /tournaments/:id/spaded/refresh',
  // Liquipedia export settings of TSS events (routes/tss.js): not the site's results.
  'PUT /tss/:id/wiki',
  // 比赛地图 (routes/missions.js): no results or players.
  'POST /missions',
  'PATCH /missions/:id',
  'PUT /missions/:id/content',
  'POST /missions/:id/revert',
  'DELETE /missions/:id',
  'POST /missions/:id/image',
  'DELETE /missions/:id/image',
  'PUT /tournaments/:id/missions',
  'POST /players/:id/touch',
  'POST /push/subscribe',
  'DELETE /push/unsubscribe',
  'POST /players/:id/key',
  'DELETE /players/:id/key',
  'POST /tournaments/:id/vote',
  'DELETE /tournaments/:id/vote',
  'POST /tournaments/:id/checkin',
  'DELETE /tournaments/:id/checkin',
  'POST /tournaments/:id/overlay-state',
  // The auto-scene script checks in every 10 s.
  'POST /tournaments/:id/game-state',
  'POST /tournaments/:id/autoscene',
  'POST /tournaments/:id/active-match',
  'POST /tournaments/:id/matches/:matchId/live-score',
  'POST /tournaments/:id/matches/:matchId/report/dispute',
  'DELETE /tournaments/:id/matches/:matchId/report',
  'POST /client-errors',
  // QQ bots: notices and account bindings never move ratings.
  'POST /bot/notices/:id/sent',
  'POST /bot/notices/sent',
  'POST /bot/bind',
  'DELETE /bot/bind/:openid',
  'POST /players/:id/qq-bind-code',
  'POST /bot/checkin',
  'DELETE /players/:id/qq-bindings',
  'DELETE /client-errors',
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
