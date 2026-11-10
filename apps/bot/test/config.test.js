import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { allowSession } from '../src/filters.js';
import { pingSite } from '../src/site.js';

test('nothing configured is a problem', () => {
  assert.equal(readConfig({}).problems.length, 1);
});

test('official bot alone: no sandbox, group @ and private message intents by default', () => {
  const c = readConfig({ QQ_APP_ID: '102', QQ_APP_SECRET: 's' });
  assert.deepEqual(c.problems, []);
  assert.equal(c.qq.sandbox, false);
  assert.equal(c.qq.intents, 1 << 25);
  assert.equal(c.onebot, null);
  assert.equal(readConfig({ QQ_APP_ID: '102', QQ_APP_SECRET: 's', QQ_SANDBOX: 'true' }).qq.sandbox, true);
  assert.equal(readConfig({ QQ_APP_ID: '102', QQ_APP_SECRET: 's', QQ_INTENTS: '1073741824' }).qq.intents, 1 << 30);
});

test('official bot needs both id and secret', () => {
  assert.equal(readConfig({ QQ_APP_ID: '102' }).problems.length, 1);
});

test('community bot needs a QQ number, a token and groups', () => {
  assert.equal(readConfig({ ONEBOT_SELF_ID: 'abc', ONEBOT_TOKEN: 't', ONEBOT_GROUPS: '1' }).problems.length, 1);
  assert.equal(readConfig({ ONEBOT_SELF_ID: '123456', ONEBOT_GROUPS: '1' }).problems.length, 1);
  assert.equal(readConfig({ ONEBOT_SELF_ID: '123456', ONEBOT_TOKEN: 't' }).problems.length, 1);
  const c = readConfig({ ONEBOT_SELF_ID: '123456', ONEBOT_TOKEN: 't', ONEBOT_GROUPS: ' 111, 222 ' });
  assert.deepEqual(c.problems, []);
  assert.deepEqual([...c.onebot.groups], ['111', '222']);
  assert.equal(c.onebot.endpoint, 'ws://127.0.0.1:3001');
});

test('site URL defaults to the local API and drops a trailing slash', () => {
  assert.equal(readConfig({ QQ_APP_ID: '1', QQ_APP_SECRET: 's' }).siteUrl, 'http://127.0.0.1:3100');
  assert.equal(readConfig({ QQ_APP_ID: '1', QQ_APP_SECRET: 's', SITE_API_URL: 'https://x.cn/' }).siteUrl, 'https://x.cn');
});

test('community bot answers only in whitelisted groups', () => {
  const config = readConfig({ ONEBOT_SELF_ID: '123456', ONEBOT_TOKEN: 't', ONEBOT_GROUPS: '111' });
  assert.equal(allowSession({ platform: 'onebot', guildId: '111' }, config), true);
  assert.equal(allowSession({ platform: 'onebot', guildId: '222' }, config), false);
  assert.equal(allowSession({ platform: 'onebot', isDirect: true }, config), false);
  assert.equal(allowSession({ platform: 'qq', isDirect: true }, config), true);
});

test('pingSite reports success, HTTP errors and network errors', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ pong: true }) });
  const bad = async () => ({ ok: false, status: 502 });
  const down = async () => { throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }); };
  assert.deepEqual(await pingSite('http://s', { fetchImpl: ok }), { ok: true });
  assert.deepEqual(await pingSite('http://s', { fetchImpl: bad }), { ok: false, error: 'HTTP 502' });
  assert.deepEqual(await pingSite('http://s', { fetchImpl: down }), { ok: false, error: 'ECONNREFUSED' });
});
