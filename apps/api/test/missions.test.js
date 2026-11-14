import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import missionsRoutes, { MISSION_FILE } from '../routes/missions.js';

test('mission files not in the database are served from MISSIONS_DIR as text, nothing else', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'missions-'));
  writeFileSync(join(dir, 'joust-desert.blk'), 'selected_tag:t=""\nmission_settings{\n}\n');
  writeFileSync(join(dir, 'notes.txt'), 'x');
  process.env.MISSIONS_DIR = dir;
  const app = Fastify();
  await app.register(sensible);
  // Nothing in the database: files come from MISSIONS_DIR.
  app.decorate('db', { query: async () => ({ rows: [], rowCount: 0 }) });
  await app.register(missionsRoutes, { prefix: '/api' });
  try {
    const ok = await app.inject({ url: '/api/missions/joust-desert.blk', headers: { 'user-agent': 'WarThunder' } });
    assert.equal(ok.statusCode, 200);
    assert.match(ok.headers['content-type'], /^text\/plain/);
    assert.match(ok.body, /mission_settings/);
    const head = await app.inject({ method: 'HEAD', url: '/api/missions/joust-desert.blk' });
    assert.equal(head.statusCode, 200);
    for (const bad of ['notes.txt', 'missing.blk', '..%2Fnotes.blk', '.hidden.blk']) {
      assert.equal((await app.inject({ url: `/api/missions/${bad}` })).statusCode, 404, bad);
    }
    assert.ok(MISSION_FILE.test('JoustDesert_BO5.blk'));
    assert.ok(!MISSION_FILE.test('../x.blk'));
  } finally {
    delete process.env.MISSIONS_DIR;
    await app.close();
  }
});
