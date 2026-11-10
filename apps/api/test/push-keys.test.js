import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pushKeys, resetPushKeys, subjectFor } from '../lib/push-keys.js';
import { pushEnabled } from '../lib/push-sender.js';

function secretsDb() {
  const rows = new Map();
  let inserts = 0;
  return {
    get inserts() { return inserts; },
    async query(sql, params) {
      if (/^SELECT value FROM axsuck\.app_secrets/.test(sql)) {
        return { rows: rows.has(params[0]) ? [{ value: rows.get(params[0]) }] : [] };
      }
      if (/^INSERT INTO axsuck\.app_secrets/.test(sql)) {
        inserts += 1;
        if (!rows.has(params[0])) rows.set(params[0], JSON.parse(params[1]));
        return { rows: [] };
      }
      throw new Error(`unexpected ${sql}`);
    },
  };
}
// web-push's real format, so setVapidDetails accepts it.
const PAIR = {
  publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  privateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
};

test('without .env keys: nothing until asked, then a pair is made once and kept', async () => {
  resetPushKeys();
  const db = secretsDb();
  const env = {};
  assert.equal(await pushKeys(db, { env }), null);
  assert.equal(pushEnabled(), false);
  let made = 0;
  const generate = () => ((made += 1), PAIR);
  const keys = await pushKeys(db, { env, create: true, origin: 'https://cup.example', generate });
  assert.equal(keys.publicKey, PAIR.publicKey);
  assert.equal(keys.subject, 'https://cup.example');
  assert.equal(pushEnabled(), true);
  // A restart reads the same pair back.
  resetPushKeys();
  const again = await pushKeys(db, { env, create: true, generate });
  assert.equal(again.publicKey, PAIR.publicKey);
  assert.equal(made, 1);
  resetPushKeys();
});

test('.env keys win and nothing is stored', async () => {
  resetPushKeys();
  const db = secretsDb();
  const keys = await pushKeys(db, { env: { VAPID_PUBLIC_KEY: PAIR.publicKey, VAPID_PRIVATE_KEY: PAIR.privateKey, VAPID_SUBJECT: 'mailto:a@b.c' }, create: true });
  assert.equal(keys.source, 'env');
  assert.equal(db.inserts, 0);
  resetPushKeys();
});

test('subjects: an https site address, else a mailto', () => {
  assert.equal(subjectFor('https://cup.example'), 'https://cup.example');
  assert.equal(subjectFor('http://localhost:3100'), 'mailto:potato-cup@example.com');
});
