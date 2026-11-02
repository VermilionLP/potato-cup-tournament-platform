// Compresses the API's JSON (and other text) responses with Brotli or gzip
// when the browser accepts them. The built web app is served pre-compressed
// by @fastify/static (static-cache.js); this covers /api, whose event, player
// and statistics JSON shrinks to a fraction. Built on node:zlib, so no extra
// dependency. Streams (SSE, static files) and binary bodies (images) pass
// through untouched.

import { promisify } from 'node:util';
import zlib from 'node:zlib';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

// Below this a response gains little and costs a round of CPU.
export const COMPRESS_THRESHOLD = 1024;
const TEXT_TYPE = /^(application\/(json|javascript|xml)|text\/(?!event-stream))/i;

/** "br", "gzip" or null from an Accept-Encoding header (q=0 means refused). */
export function pickEncoding(acceptEncoding) {
  const accepted = new Set();
  for (const part of String(acceptEncoding || '').toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';').map((s) => s.trim());
    const q = params.find((p) => p.startsWith('q='));
    if (name && !(q && Number(q.slice(2)) === 0)) accepted.add(name);
  }
  if (accepted.has('br')) return 'br';
  if (accepted.has('gzip') || accepted.has('*')) return 'gzip';
  return null;
}

/** Whether a finished response should be compressed. */
export function shouldCompress({ method, statusCode, contentType, contentEncoding, payload, threshold = COMPRESS_THRESHOLD }) {
  if (method === 'HEAD' || statusCode === 204 || statusCode === 304) return false;
  if (contentEncoding) return false;
  if (!TEXT_TYPE.test(String(contentType || ''))) return false;
  if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) return false;
  return Buffer.byteLength(payload) >= threshold;
}

/** The payload compressed with `encoding` ("br" or "gzip"). */
export function compressPayload(payload, encoding) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (encoding === 'br') {
    // Quality 4: most of Brotli's gain at a small CPU cost for live responses.
    return brotli(buf, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
      },
    });
  }
  return gzip(buf, { level: 6 });
}

/** onSend hook compressing eligible responses. */
export function registerCompression(fastify, { threshold = COMPRESS_THRESHOLD } = {}) {
  fastify.addHook('onSend', async (req, reply, payload) => {
    if (!shouldCompress({
      method: req.method,
      statusCode: reply.statusCode,
      contentType: reply.getHeader('content-type'),
      contentEncoding: reply.getHeader('content-encoding'),
      payload,
      threshold,
    })) return payload;
    const vary = reply.getHeader('vary');
    if (!vary) reply.header('Vary', 'Accept-Encoding');
    else if (!/accept-encoding/i.test(String(vary))) reply.header('Vary', `${vary}, Accept-Encoding`);
    const encoding = pickEncoding(req.headers['accept-encoding']);
    if (!encoding) return payload;
    const out = await compressPayload(payload, encoding);
    reply.header('Content-Encoding', encoding);
    reply.removeHeader('content-length');
    return out;
  });
}
