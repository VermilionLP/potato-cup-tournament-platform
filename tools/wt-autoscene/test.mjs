// node --test tools/wt-autoscene/test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { detectState, nextScene, obsAuth, reportState, stateTracker } from './detect.mjs';

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
  assert.equal(opt['min-battle'], '60');
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

test('reportState: a short battle is not the end of a match', () => {
  assert.equal(reportState('battle', null), 'battle');
  assert.equal(reportState('hangar', null), 'hangar');
  assert.equal(reportState('ended', 5 * 60_000), 'ended');
  assert.equal(reportState('ended', 20_000), 'hangar', 'left after 20 s: a disconnect or the wrong room');
  assert.equal(reportState('ended', 20_000, 10_000), 'ended');
});

import http from 'node:http';
import { applyChanges, dataDirFor, panelEngineConfig, stamp, toEngineConfig } from './config.mjs';
import { configProblems, createEngine } from './engine.mjs';

test('panel config: types are checked, secrets kept apart, record next to config.json', () => {
  const f = applyChanges({ site: '', channel: 1 }, { site: ' https://x.com/ ', channel: '3', dryRun: 1, nope: 'x', adminToken: ' t ' });
  assert.deepEqual(f, { site: 'https://x.com', channel: 3, dryRun: true, adminToken: 't' });
  assert.throws(() => applyChanges({}, { channel: 'abc' }));
  assert.throws(() => applyChanges({}, { channel: 1.5 }));
  assert.throws(() => applyChanges({}, { site: 5 }));
  const cfg = panelEngineConfig({ site: 'https://x.com', event: 'e', adminToken: 't', record: 'wt-log.jsonl', endDelay: 5 }, '/apps');
  assert.equal(cfg.token, 't');
  assert.equal(cfg.endDelay, 5);
  assert.equal(cfg.record, '/apps/wt-log.jsonl');
  assert.deepEqual(configProblems(cfg), []);
});

test('config problems are said in words', () => {
  const base = toEngineConfig({ channel: '1', game: 'http://127.0.0.1:8111', interval: '1000', stable: '2', 'end-delay': '8', 'min-battle': '60' });
  assert.match(configProblems(base).join(), /至少需要网站地址/);
  assert.match(configProblems({ ...base, site: 'https://x', event: 'e' }).join(), /缺少管理员令牌/);
  assert.deepEqual(configProblems({ ...base, site: 'https://x', event: 'e', dryRun: true }), []);
  assert.match(configProblems({ ...base, site: 'x.com', event: 'e', token: 't' }).join(), /https/);
  assert.match(configProblems({ ...base, obs: 'http://x' }).join(), /ws:\/\//);
  assert.match(configProblems({ ...base, obs: 'ws://x', channel: 12 }).join(), /1-9/);
});

test('engine: hangar, battle, back to hangar reports hangar → battle → ended', async () => {
  let gameState = 'hangar';
  const reports = [];
  const game = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/map_info.json') return res.end(JSON.stringify({ valid: gameState === 'battle' }));
    return res.end(JSON.stringify({ status: 'running' }));
  });
  const site = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    if (req.headers['x-admin-token'] !== 'tok') {
      res.statusCode = 401;
      return res.end('{}');
    }
    reports.push([req.url, JSON.parse(body)]);
    res.end(JSON.stringify({ paused: false }));
  });
  await Promise.all([game, site].map((s) => new Promise((r) => s.listen(0, '127.0.0.1', r))));
  const statuses = [];
  const engine = createEngine({ onChange: (s) => statuses.push(s) });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    engine.start({
      ...toEngineConfig({}),
      site: `http://127.0.0.1:${site.address().port}`, token: 'tok', event: 'w1', channel: 2,
      game: `http://127.0.0.1:${game.address().port}`, interval: 200, stable: 1, endDelay: 1, minBattle: 0,
    });
    await wait(600);
    gameState = 'battle';
    await wait(600);
    gameState = 'hangar';
    await wait(400);
    assert.ok(engine.status().endAt, 'the end waits for the end delay');
    await wait(1100);
    const states = reports.filter(([u]) => u.endsWith('/game-state')).map(([, b]) => b.state);
    assert.deepEqual([...new Set(states)], ['hangar', 'battle', 'ended']);
    assert.equal(reports[0][0], '/api/tournaments/w1/game-state');
    assert.equal(reports[0][1].channel, 2);
    await engine.setPaused(true);
    assert.deepEqual(reports.at(-1), ['/api/tournaments/w1/autoscene', { channel: 2, paused: true }]);
    assert.equal(engine.status().paused, true);
    assert.equal(engine.status().site.ok, true);
    engine.stop();
    assert.equal(engine.status().running, false);
    assert.ok(statuses.length > 3);
  } finally {
    engine.stop();
    game.close();
    site.close();
  }
});

test('the .exe keeps its files in a PotatoCup-AutoScene folder', () => {
  assert.equal(dataDirFor('/Users/a/Downloads'), '/Users/a/Downloads/PotatoCup-AutoScene');
  assert.equal(dataDirFor('/Users/a/potatocup-autoscene'), '/Users/a/potatocup-autoscene');
  assert.equal(stamp(new Date(2026, 10, 3, 7, 5, 9)), '2026-11-03 07:05:09');
});
