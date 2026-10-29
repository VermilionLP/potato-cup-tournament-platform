// node --test tools/wt-autoscene/test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { detectState, obsAuth, stateTracker } from './detect.mjs';

test('detectState', () => {
  assert.equal(detectState({ reachable: false }), 'offline');
  assert.equal(detectState({ reachable: true, mapInfo: { valid: false } }), 'hangar');
  assert.equal(detectState({ reachable: true, mapInfo: { valid: true }, mission: { status: 'running' } }), 'battle');
  assert.equal(detectState({ reachable: true, mapInfo: { valid: true }, mission: null }), 'battle');
  assert.equal(detectState({ reachable: true, mapInfo: { valid: true }, mission: { status: 'success' } }), 'ended');
  assert.equal(detectState({ reachable: true, mapInfo: { valid: true }, mission: { status: 'fail' } }), 'ended');
});

test('stateTracker waits for a stable state', () => {
  const t = stateTracker(2);
  assert.equal(t('hangar'), null);
  assert.deepEqual(t('hangar'), { from: null, to: 'hangar' });
  assert.equal(t('hangar'), null);
  assert.equal(t('battle'), null);
  assert.equal(t('hangar'), null, 'a one-poll blip is ignored');
  assert.equal(t('battle'), null);
  assert.deepEqual(t('battle'), { from: 'hangar', to: 'battle' });
});

test('obsAuth follows obs-websocket v5', async () => {
  const secret = createHash('sha256').update('pw' + 'salt').digest('base64');
  const want = createHash('sha256').update(secret + 'ch').digest('base64');
  assert.equal(await obsAuth('pw', 'salt', 'ch'), want);
});
