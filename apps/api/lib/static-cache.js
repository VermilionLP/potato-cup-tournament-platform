// Caching for the built web app served by @fastify/static.
//
// SvelteKit puts content-hashed files under /_app/immutable/: a new build
// gets new file names, so browsers may keep them for a year. Pages and other
// unhashed entry files (index.html, sw.js, manifest, version.json) are
// revalidated on every load so a deploy shows up at once. Images, fonts and
// flags change rarely: one day.

const YEAR = 'public, max-age=31536000, immutable';
const ALWAYS_CHECK = 'no-cache';
const DAY = 'public, max-age=86400';

const STATIC_ASSET = /\.(svg|png|jpe?g|gif|webp|ico|woff2?|ttf)$/i;

/** Cache-Control for a served file (path may end in .br / .gz). */
export function cacheControlFor(filePath) {
  const path = String(filePath).replace(/\\/g, '/').replace(/\.(br|gz)$/, '');
  if (path.includes('/_app/immutable/')) return YEAR;
  if (STATIC_ASSET.test(path)) return DAY;
  return ALWAYS_CHECK;
}

/**
 * setHeaders for @fastify/static (with cacheControl: false). Since v10 it
 * is called with the Fastify reply (`reply.header`); before, with the raw
 * response (`res.setHeader`). Both are accepted.
 */
export function staticCacheHeaders(reply, filePath) {
  const set = typeof reply.header === 'function' ? (k, v) => reply.header(k, v) : (k, v) => reply.setHeader(k, v);
  set('Cache-Control', cacheControlFor(filePath));
  // The same URL may be sent as br, gzip or plain.
  set('Vary', 'Accept-Encoding');
}
