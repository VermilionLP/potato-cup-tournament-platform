import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deliverOnce, noticeMessage, pauseMs } from '../src/notices.js';
import { findPlayer, formatSchedule, formatStats, shortTime } from '../src/format.js';
import { attemptLimiter } from '../src/commands.js';
import { readConfig } from '../src/config.js';

const { h } = createRequire(import.meta.url)('koishi');

test('a notice @s each QQ number, then the text', () => {
  const msg = noticeMessage(h, { mentions: ['10001', '10002'], text: '【W】比赛就绪' });
  assert.equal(msg.map(String).join(''), '<at id="10001"/> <at id="10002"/> \n【W】比赛就绪');
  assert.deepEqual(noticeMessage(h, { mentions: [], text: 'x' }).map(String), ['x']);
});

test('pauses between messages are 3 to 7 seconds', () => {
  assert.equal(pauseMs(() => 0), 3000);
  assert.equal(pauseMs(() => 0.9999), 6999);
});

function fakeSite(notices, { failMark = false } = {}) {
  const marked = [];
  return {
    marked,
    notices: async () => notices,
    markSent: async (id) => {
      if (failMark) throw new Error('site down');
      marked.push(id);
    },
  };
}

test('delivery posts in order, marks each sent, and stops at the first failure', async () => {
  const sent = [];
  const bot = { sendMessage: async (group, msg) => { if (msg.at(-1) === 'boom') throw new Error('risk control'); sent.push([group, msg.at(-1)]); } };
  const site = fakeSite([{ id: 1, text: 'a', mentions: [] }, { id: 2, text: 'boom', mentions: [] }, { id: 3, text: 'c', mentions: [] }]);
  const posted = await deliverOnce({ site, getBot: () => bot, groupId: 111, h, pause: async () => {}, logger: { warn() {} } });
  assert.equal(posted, 1);
  assert.deepEqual(sent, [['111', 'a']]);
  assert.deepEqual(site.marked, [1], 'the failed one and the rest wait for the next round');
});

test('no online bot: nothing fetched; a failed mark stops the round', async () => {
  let asked = false;
  const site = { notices: async () => { asked = true; return []; } };
  assert.equal(await deliverOnce({ site, getBot: () => null, groupId: 1, h }), 0);
  assert.equal(asked, false);
  const sent = [];
  const bot = { sendMessage: async (g, m) => sent.push(m) };
  const failing = fakeSite([{ id: 1, text: 'a' }, { id: 2, text: 'b' }], { failMark: true });
  assert.equal(await deliverOnce({ site: failing, getBot: () => bot, groupId: 1, h, pause: async () => {}, logger: { warn() {} } }), 1);
  assert.equal(sent.length, 1, 'not posted twice while the site cannot record it');
});

test('schedule reply lists events and what needs doing now', () => {
  assert.match(formatSchedule({ player_id: 'Alpha', events: [], now: [] }), /没有报名未结束的比赛/);
  const text = formatSchedule({
    player_id: 'Alpha',
    events: [
      { name: 'Weekly #40', status: 'registration', scheduled_time: '2026-11-14T20:00', checkin_enabled: true, checked_in: false },
      { name: 'Weekly #39', status: 'in_progress', scheduled_time: '2026-11-07T20:00' },
    ],
    now: [
      { tournament: 'Weekly #39', kind: 'confirm', opponent: 'Bravo', score: [1, 2] },
      { tournament: 'Weekly #39', kind: 'ban', opponent: 'Bravo' },
    ],
  });
  assert.match(text, /Weekly #40 — 11-14 20:00 · 报名中 · 需签到/);
  assert.match(text, /Weekly #39 — 11-07 20:00 · 进行中/);
  assert.match(text, /请确认与 Bravo 的比分（1 : 2）/);
  assert.match(text, /轮到你禁用（对手 Bravo）/);
  assert.equal(shortTime(''), '时间待定');
  assert.equal(shortTime('2026-1-5'), '01-05');
});

test('stats reply and finding a player by name', () => {
  const players = [{ id: 'Alpha', display_name: 'Alpha', tournaments_played: 12, matches_won: 30, matches_lost: 10, maps_won: 70, maps_lost: 40, championships: 3, runner_ups: 2 }];
  assert.equal(findPlayer(players, 'alpha'), players[0]);
  assert.equal(findPlayer(players, 'nobody'), null);
  const text = formatStats(players[0]);
  assert.match(text, /参赛 12 次 · 30 胜 10 负（胜率 75%）/);
  assert.match(text, /小局 70 : 40 · 冠军 3 · 亚军 2/);
  assert.match(formatStats({ id: 'New' }), /0 胜 0 负（胜率 —）/);
});

test('binding attempts are limited per person', () => {
  let t = 0;
  const may = attemptLimiter(2, 1000, () => t);
  assert.equal(may('a'), true);
  assert.equal(may('a'), true);
  assert.equal(may('a'), false);
  assert.equal(may('b'), true, 'others are not affected');
  t = 1001;
  assert.equal(may('a'), true, 'allowed again after the window');
});

test('notice group defaults to the first allowed group and must be one of them', () => {
  const base = { ONEBOT_SELF_ID: '123456', ONEBOT_TOKEN: 't', ONEBOT_GROUPS: '111,222' };
  assert.equal(readConfig(base).onebot.noticeGroup, '111');
  assert.equal(readConfig({ ...base, ONEBOT_NOTICE_GROUP: '222' }).onebot.noticeGroup, '222');
  assert.equal(readConfig({ ...base, ONEBOT_NOTICE_GROUP: '333' }).problems.length, 1);
  assert.equal(readConfig(base).botToken, null);
  assert.equal(readConfig({ ...base, BOT_TOKEN: ' x ' }).botToken, 'x');
});

import { formatCheckedIn, formatOpenEvents, formatRegistered, pickEvent } from '../src/format.js';

const open = [
  { id: 'w40', name: 'Weekly #40', scheduled_time: '2026-11-14T20:00', player_count: 12, player_capacity: 32, checkin_enabled: true, registered: false },
  { id: 'w41', name: 'Weekly #41', scheduled_time: '2026-11-21T20:00', player_count: 32, player_capacity: 32, registered: false },
  { id: 'm1', name: 'Monthly', scheduled_time: '', player_count: 3, player_capacity: 16, checkin_enabled: true, registered: true, checked_in: true },
];

test('the 报名 list numbers events and says what to send next', () => {
  const text = formatOpenEvents({ player_id: 'Alpha', events: open });
  assert.match(text, /1\. Weekly #40 — 11-14 20:00 · 12\/32 人\n/);
  assert.match(text, /2\. Weekly #41 — 11-21 20:00 · 32\/32 人 · 已满/);
  assert.match(text, /3\. Monthly — 时间待定 · 3\/16 人 · 已报名，已签到/);
  assert.match(text, /发送「报名 1」报名/);
  assert.match(formatOpenEvents({ player_id: null, events: open }), /还没有绑定选手/);
  assert.equal(formatOpenEvents({ events: [] }), '目前没有正在报名的赛事。');
});

test('events are picked by number, id or name; withdraw falls back to the only one', () => {
  assert.equal(pickEvent(open, '2').id, 'w41');
  assert.equal(pickEvent(open, ' w40 ').id, 'w40');
  assert.equal(pickEvent(open, 'Monthly').id, 'm1');
  assert.equal(pickEvent(open, '9'), null);
  assert.equal(pickEvent(open, ''), null);
  assert.equal(pickEvent(open, '', (es) => es.find((e) => e.registered)).id, 'm1');
});

test('registration and check-in replies', () => {
  assert.match(formatRegistered(open[0]), /报名成功：Weekly #40（11-14 20:00）。这场需要签到/);
  assert.doesNotMatch(formatRegistered(open[1]), /签到/);
  assert.equal(formatCheckedIn(['Weekly #40', 'Monthly']), '签到成功：Weekly #40、Monthly。');
  assert.match(formatCheckedIn([]), /现在没有可以签到的比赛/);
});

import { unglue } from '../src/commands.js';

test('a number typed straight after the command still counts', () => {
  assert.equal(unglue('绑定123456'), '绑定 123456');
  assert.equal(unglue('/绑定123456'), '绑定 123456');
  assert.equal(unglue(' BIND123456 '), 'BIND 123456');
  assert.equal(unglue('报名1'), '报名 1');
  assert.equal(unglue('取消报名12'), '取消报名 12');
  assert.equal(unglue('签到2'), '签到 2');
  assert.equal(unglue('绑定 123456'), null, 'spaced commands go through the normal parser');
  assert.equal(unglue('绑定abc'), null);
  assert.equal(unglue('战绩Alpha'), null, 'names are not split');
});

import { createRenderer, openEventsCard, scheduleCard, statsCard } from '../src/cards.js';

test('cards render to PNG with the site font, and long names do not break them', async () => {
  const r = createRenderer();
  const png = await r.schedule({
    player_id: 'Alpha',
    events: [{ name: 'Potato Cup 超长的赛事名称 '.repeat(4), status: 'registration', scheduled_time: '2026-11-14T20:00', checkin_enabled: true }],
    now: [{ tournament: 'W', kind: 'confirm', opponent: 'Bravo', score: [1, 2] }],
  }, new Date('2026-11-10T03:00:00Z'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1440, '2x width');
  for (const tree of [openEventsCard({ events: [] }), statsCard({ id: 'New' }), scheduleCard({ player_id: 'X', events: [], now: [] })]) {
    const out = await r.render(tree);
    assert.equal(out.subarray(1, 4).toString(), 'PNG');
  }
});

test('a failing card falls back to the text reply', async () => {
  const { createRequire } = await import('node:module');
  const { Context } = createRequire(import.meta.url)('koishi');
  const { registerCommands } = await import('../src/commands.js');
  const handlers = {};
  const fakeCtx = { platform: () => fakeCtx, middleware() {}, command: (decl) => {
    const cmd = { alias: () => cmd, action: (fn) => { handlers[decl.split(' ')[0]] = fn; return cmd; } };
    return cmd;
  } };
  const site = { whois: async () => 'Alpha', schedule: async () => ({ player_id: 'Alpha', events: [], now: [] }) };
  const broken = { cards: { schedule: async () => { throw new Error('no font'); } }, h: { image: () => 'IMAGE' } };
  registerCommands(fakeCtx, site, { warn() {} }, broken);
  assert.match(await handlers['赛程']({ session: { userId: 'OPENID' } }), /没有报名未结束的比赛/);
  const working = { cards: { schedule: async () => Buffer.from('png') }, h: { image: (buf, type) => `IMAGE:${type}:${buf}` } };
  registerCommands(fakeCtx, site, { warn() {} }, working);
  assert.equal(await handlers['赛程']({ session: { userId: 'OPENID' } }), 'IMAGE:image/png:png');
  void Context;
});
