// node --test tools/wt-autoscene/test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { detectState, nextScene, obsAuth, stateTracker } from './detect.mjs';

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

import { mergeOptions } from './config.mjs';

test('options: command line > config.json > defaults', () => {
  const opt = mergeOptions({ channel: '3' }, { site: 'https://x', channel: 2, endDelay: 5, obs: '', dryRun: true, askEvent: true });
  assert.equal(opt.site, 'https://x');
  assert.equal(opt.channel, '3');
  assert.equal(opt['end-delay'], '5');
  assert.equal(opt.obs, undefined, 'empty values are ignored');
  assert.equal(opt['dry-run'], true);
  assert.equal(opt.ask, true);
  assert.equal(opt['scene-battle'], 'ingame');
});

test('nextScene: leaving a battle is its end, loading gaps are ignored', () => {
  assert.deepEqual(nextScene(null, 'hangar'), { scene: 'hangar', delayed: false });
  assert.deepEqual(nextScene('hangar', 'battle'), { scene: 'battle', delayed: false });
  assert.equal(nextScene('battle', 'offline'), null, 'a few seconds without answers keep the scene');
  assert.deepEqual(nextScene('battle', 'hangar'), { scene: 'ended', delayed: true });
  assert.deepEqual(nextScene('battle', 'ended'), { scene: 'ended', delayed: true });
  assert.equal(nextScene('ended', 'hangar'), null);
});

test('the recorded spectated battle: hangar, battle, back to hangar', () => {
  // tools/wt-autoscene recordings, 2026-10-29: status stays "running".
  const polls = [
    { reachable: true, mapInfo: { valid: false }, mission: { objectives: null, status: 'running' } },
    { reachable: false },
    { reachable: true, mapInfo: { hud_type: 0, map_generation: 3, valid: true }, mission: { objectives: null, status: 'running' } },
    { reachable: false },
    { reachable: true, mapInfo: { valid: false }, mission: { objectives: null, status: 'running' } },
  ];
  const track = stateTracker(2);
  let lastActive = null;
  const scenes = [];
  for (const p of polls) {
    for (let i = 0; i < 3; i += 1) {
      const change = track(detectState(p));
      if (!change) continue;
      const next = nextScene(lastActive, change.to);
      if (change.to !== 'offline') lastActive = change.to;
      if (next) scenes.push(next.scene + (next.delayed ? '+delay' : ''));
    }
  }
  assert.deepEqual(scenes, ['hangar', 'battle', 'ended+delay']);
});
