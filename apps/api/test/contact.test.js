import test from 'node:test';
import assert from 'node:assert/strict';
import { contactProblem, hasContact, parseContact, requireContact } from '../lib/contact.js';

test('contact is read from battle_tags in any shape', () => {
  assert.deepEqual(parseContact('{"qq":"12345678"}'), { qq: '12345678', discord: '' });
  assert.deepEqual(parseContact({ discord: ['  bob  '] }), { qq: '', discord: 'bob' });
  assert.deepEqual(parseContact('not json'), { qq: '', discord: '' });
  assert.equal(hasContact('{}'), false);
  assert.equal(hasContact('{"discord":"bob"}'), true);
});

test('QQ numbers and Discord names are checked', () => {
  assert.equal(contactProblem({ qq: '12345678' }), '');
  assert.match(contactProblem({ qq: '1234' }), /QQ/);
  assert.match(contactProblem({ qq: '01234567' }), /QQ/);
  assert.equal(contactProblem({ discord: 'vermilion_lp' }), '');
  assert.equal(contactProblem({ discord: 'Old#1234' }), '');
  assert.match(contactProblem({ discord: 'has space' }), /Discord/);
  assert.match(contactProblem({ discord: 'a' }), /Discord/);
});

test('players need a contact to register or vote; admins do not', () => {
  const fastify = { httpErrors: { badRequest: (m) => Object.assign(new Error(m), { statusCode: 400 }) } };
  delete process.env.ADMIN_TOKEN;
  assert.throws(() => requireContact(fastify, { headers: {} }, { battle_tags: '{}' }), (e) => e.statusCode === 400);
  assert.throws(() => requireContact(fastify, { headers: {} }, null), (e) => e.statusCode === 400);
  assert.doesNotThrow(() => requireContact(fastify, { headers: {} }, { battle_tags: '{"qq":"12345678"}' }));
  process.env.ADMIN_TOKEN = 'secret';
  assert.doesNotThrow(() => requireContact(fastify, { headers: { 'x-admin-token': 'secret' } }, null));
  delete process.env.ADMIN_TOKEN;
});
