import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { COMPRESS_THRESHOLD, compressPayload, pickEncoding, registerCompression, shouldCompress } from '../lib/compression.js';

test('picks Brotli, then gzip, honouring q=0', () => {
  assert.equal(pickEncoding('gzip, deflate, br, zstd'), 'br');
  assert.equal(pickEncoding('gzip, deflate'), 'gzip');
  assert.equal(pickEncoding('br;q=0, gzip;q=0.8'), 'gzip');
  assert.equal(pickEncoding('*'), 'gzip');
  assert.equal(pickEncoding('identity'), null);
  assert.equal(pickEncoding(undefined), null);
});

test('only text bodies above the threshold, never SSE or images', () => {
  const big = 'x'.repeat(COMPRESS_THRESHOLD);
  const base = { method: 'GET', statusCode: 200, contentType: 'application/json; charset=utf-8', payload: big };
  assert.equal(shouldCompress(base), true);
  assert.equal(shouldCompress({ ...base, contentType: 'text/calendar; charset=utf-8' }), true);
  assert.equal(shouldCompress({ ...base, payload: 'small' }), false);
  assert.equal(shouldCompress({ ...base, contentType: 'text/event-stream' }), false);
  assert.equal(shouldCompress({ ...base, contentType: 'image/png', payload: Buffer.alloc(5000) }), false);
  assert.equal(shouldCompress({ ...base, contentEncoding: 'br' }), false);
  assert.equal(shouldCompress({ ...base, method: 'HEAD' }), false);
  assert.equal(shouldCompress({ ...base, statusCode: 304 }), false);
  assert.equal(shouldCompress({ ...base, payload: { pipe() {} } }), false, 'streams pass through');
});

test('compressed payloads decode back', async () => {
  const json = JSON.stringify({ players: Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: '选手' })) });
  const br = await compressPayload(json, 'br');
  const gz = await compressPayload(json, 'gzip');
  assert.equal(zlib.brotliDecompressSync(br).toString(), json);
  assert.equal(zlib.gunzipSync(gz).toString(), json);
  assert.ok(br.length < json.length / 5, `brotli ${br.length} of ${json.length}`);
});

function fakeFastify() {
  let hook;
  return { addHook: (name, fn) => { assert.equal(name, 'onSend'); hook = fn; }, send: (...a) => hook(...a) };
}
function fakeReply(headers) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    statusCode: 200,
    headers: h,
    getHeader: (k) => h[k.toLowerCase()],
    header(k, v) { h[k.toLowerCase()] = v; return this; },
    removeHeader(k) { delete h[k.toLowerCase()]; },
  };
}

test('the hook sets headers and swaps the body', async () => {
  const f = fakeFastify();
  registerCompression(f);
  const body = JSON.stringify({ x: 'y'.repeat(4000) });
  const reply = fakeReply({ 'content-type': 'application/json; charset=utf-8', 'content-length': '9' });
  const out = await f.send({ method: 'GET', headers: { 'accept-encoding': 'gzip, br' } }, reply, body);
  assert.equal(reply.headers['content-encoding'], 'br');
  assert.equal(reply.headers.vary, 'Accept-Encoding');
  assert.equal(reply.headers['content-length'], undefined);
  assert.equal(zlib.brotliDecompressSync(out).toString(), body);

  const plain = fakeReply({ 'content-type': 'application/json', vary: 'Origin' });
  assert.equal(await f.send({ method: 'GET', headers: {} }, plain, body), body, 'no Accept-Encoding: as is');
  assert.equal(plain.headers.vary, 'Origin, Accept-Encoding', 'caches still keyed by encoding');
  assert.equal(plain.headers['content-encoding'], undefined);
});
