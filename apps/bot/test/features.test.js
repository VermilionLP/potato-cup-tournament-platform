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
