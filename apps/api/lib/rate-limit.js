// A small in-memory rate limit for write requests (no dependency; one API
// process). Each client IP gets `limit` requests per `windowMs` per bucket;
// past that the request is answered with 429 and Retry-After. Reads (GET,
// HEAD, OPTIONS) and admin requests are not limited.

import { isAdminRequest } from './admin.js';

export const RATE_LIMITS = [
  // Binding device keys: a handful per minute is plenty.
  { bucket: 'player-key', test: (path) => /^\/api\/players\/[^/]+\/key$/.test(path), limit: 10, windowMs: 60_000 },
  // Everything else that writes: registration, votes, profiles, results.
  { bucket: 'write', test: () => true, limit: 60, windowMs: 60_000 },
];

export function createRateLimiter(rules = RATE_LIMITS, now = () => Date.now()) {
  const hits = new Map(); // `${bucket}|${ip}` -> { count, resetAt }
  let nextSweep = 0;

  function sweep(t) {
    if (t < nextSweep) return;
    nextSweep = t + 60_000;
    for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
  }

  /** null when allowed, else { retryAfter } in seconds. */
  function check(ip, path) {
    const rule = rules.find((r) => r.test(path));
    if (!rule) return null;
    const t = now();
    sweep(t);
    const key = `${rule.bucket}|${ip}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + rule.windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count <= rule.limit) return null;
    return { retryAfter: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
  }

  return { check, size: () => hits.size };
}

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function registerRateLimit(fastify, limiter = createRateLimiter()) {
  fastify.addHook('onRequest', async (req, reply) => {
    if (READS.has(req.method) || !req.url.startsWith('/api/')) return;
    if (isAdminRequest(req)) return;
    const path = req.url.split('?')[0];
    const blocked = limiter.check(req.ip, path);
    if (!blocked) return;
    reply.header('Retry-After', String(blocked.retryAfter));
    throw fastify.httpErrors.tooManyRequests(`操作太频繁，请 ${blocked.retryAfter} 秒后再试`);
  });
}
