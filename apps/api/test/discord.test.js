import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discordMessage, discordSettingsProblem, maskWebhook, normalizeDiscordSettings, podiumFrom, postWebhook, roundName } from '../lib/discord.js';

const t = { id: 'potatocupweekly41', name: 'Potato Cup Weekly #41', scheduled_time: '2026-11-08T20:00' };

test('settings: defaults, checks and masking', () => {
  const s = normalizeDiscordSettings({ webhook_url: ' https://discord.com/api/webhooks/1/abc ', site_url: 'https://cup.example/', events: { result: false } });
  assert.equal(s.site_url, 'https://cup.example');
  assert.deepEqual(s.events, { registration: true, start: true, result: false, champion: true });
  assert.equal(discordSettingsProblem({ webhook_url: 'http://x/y' }), 'Webhook 地址必须以 https:// 开头');
  assert.equal(discordSettingsProblem({ webhook_url: 'https://relay.example/hook', site_url: '' }), null);
  assert.equal(maskWebhook('https://discord.com/api/webhooks/123456/abcdefghijk'), 'https://discord.com/api/we…hijk');
});

test('messages', () => {
  assert.match(discordMessage('registration', t, {}, 'https://cup.example').content, /开放报名，比赛时间（北京时间）2026-11-08 20:00\nhttps:\/\/cup\.example\/tournament\/potatocupweekly41$/);
  assert.match(discordMessage('start', t, { players: 12 }).content, /12 名选手$/);
  assert.match(discordMessage('test').content, /测试消息/);
  assert.equal(discordMessage('result', t, { player1: 'A', player2: 'B', score1: 2, score2: 1, round: '决赛' }).content, '🎮 **Potato Cup Weekly #41** · 决赛：A **2 : 1** B');
  assert.match(discordMessage('result', t, { player1: 'A', player2: 'B', walkover: true, winner: 'B' }).content, /B 对手弃权胜（A）/);
  const champ = discordMessage('champion', t, { champion: 'A', podium: [['A'], ['B'], ['C', 'D']] }).content;
  assert.match(champ, /冠军：\*\*A\*\*\n🥇 A\n🥈 B\n🥉 C \/ D$/);
});

test('round names and the podium', () => {
  assert.equal(roundName({ bracket: 'main', round: 1 }, 3), '决赛');
  assert.equal(roundName({ bracket: 'main', round: 3 }, 3), '四分之一决赛');
  assert.equal(roundName({ bracket: 'main', round: 5 }, 5), '第 1 轮');
  assert.equal(roundName({ bracket: 'gf', round: 1, position: 2 }), '总决赛重置赛');
  assert.equal(roundName({ bracket: 'sw', round: 2 }), '瑞士轮第 2 轮');
  const places = new Map([['a', { from: 1, to: 1 }], ['b', { from: 2, to: 2 }], ['d', { from: 3, to: 4 }], ['c', { from: 3, to: 4 }], ['e', { from: 5, to: 8 }]]);
  assert.deepEqual(podiumFrom(places), [['a'], ['b'], ['c', 'd']]);
});

test('posting reports failures instead of throwing', async () => {
  const ok = await postWebhook('https://x/y', { content: 'hi' }, async () => ({ ok: true, status: 204 }));
  assert.equal(ok.ok, true);
  const bad = await postWebhook('https://x/y', { content: 'hi' }, async () => ({ ok: false, status: 404, text: async () => 'Unknown Webhook' }));
  assert.deepEqual([bad.ok, bad.error], [false, 'HTTP 404 Unknown Webhook']);
  const down = await postWebhook('https://x/y', { content: 'hi' }, async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ETIMEDOUT' } }); });
  assert.deepEqual([down.ok, down.error], [false, 'ETIMEDOUT']);
});
