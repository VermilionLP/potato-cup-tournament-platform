import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { registerSecurityHeaders, SECURITY_HEADERS } from '../lib/security-headers.js';

test('every response carries the security headers; one a route sets is kept', async () => {
  const app = Fastify();
  registerSecurityHeaders(app);
  app.get('/a', async () => ({ ok: true }));
  app.get('/b', async (req, reply) => reply.header('x-frame-options', 'DENY').send('x'));
  const a = await app.inject('/a');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(a.headers[name], value, name);
  assert.equal(a.headers['x-powered-by'], undefined);
  assert.equal((await app.inject('/b')).headers['x-frame-options'], 'DENY');
  assert.equal((await app.inject('/missing')).headers['x-content-type-options'], 'nosniff', 'errors too');
});
