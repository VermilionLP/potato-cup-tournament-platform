import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noticeText, queueBotNotice, qqNumbersOf } from '../lib/bot-notices.js';
import { queueEventReminders } from '../lib/bot-scheduler.js';

// A database that answers the few queries these helpers make.
function db({ players = [], events = [], registered = [], claimed = new Set() } = {}) {
  const inserted = [];
  return {
    inserted,
    async query(sql, params = []) {
      if (/FROM axsuck\.players/.test(sql)) {
        return { rows: players.filter((p) => params[0].includes(p.id)) };
      }
      if (/INSERT INTO axsuck\.bot_notices/.test(sql)) {
        inserted.push({ kind: params[0], tournament_id: params[1], text: params[2], mentions: params[3] });
        return { rows: [{ id: inserted.length }] };
      }
      if (/FROM axsuck\.tournaments/.test(sql)) return { rows: events };
      if (/INSERT INTO axsuck\.push_reminders/.test(sql)) {
        const key = `${params[0]}|${params[1]}`;
        if (claimed.has(key)) return { rows: [], rowCount: 0 };
        claimed.add(key);
        return { rows: [{ tournament_id: params[0] }], rowCount: 1 };
      }
      if (/FROM axsuck\.tournament_players/.test(sql)) return { rows: registered.map((player_id) => ({ player_id })) };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

const withToken = async (fn) => {
  const saved = process.env.BOT_TOKEN;
  process.env.BOT_TOKEN = 'secret';
  try {
    return await fn();
  } finally {
    process.env.BOT_TOKEN = saved;
  }
};

const players = [
  { id: 'Alpha', battle_tags: { qq: '10001' } },
  { id: 'Bravo', battle_tags: JSON.stringify({ qq: '10002', discord: 'bravo' }) },
  { id: 'Charlie', battle_tags: { discord: 'charlie' } },
];

test('no bot token, no notices', async () => {
  const saved = process.env.BOT_TOKEN;
  process.env.BOT_TOKEN = '';
  try {
    const d = db({ players });
    assert.equal(await queueBotNotice(d, { kind: 'ready', text: 'x', mention: ['Alpha'] }), null);
    assert.equal(d.inserted.length, 0);
  } finally {
    process.env.BOT_TOKEN = saved;
  }
});

test('mentions are the QQ numbers of the players who have one, once each, in order', async () => {
  assert.deepEqual(await qqNumbersOf(db({ players }), ['Bravo', 'Charlie', 'Alpha', 'Bravo', null]), ['10002', '10001']);
  await withToken(async () => {
    const d = db({ players });
    const id = await queueBotNotice(d, { kind: 'ready', tournamentId: 't1', text: 'hi', mention: ['Alpha', 'Charlie'] });
    assert.equal(id, 1);
    assert.deepEqual(d.inserted[0], { kind: 'ready', tournament_id: 't1', text: 'hi', mentions: ['10001'] });
  });
});

test('a failing insert does not throw', async () => {
  await withToken(async () => {
    const broken = { query: async () => { throw new Error('db down'); } };
    assert.equal(await queueBotNotice(broken, { kind: 'x', text: 'y' }, { error() {} }), null);
  });
});

test('notice texts name the event, players and score', () => {
  assert.match(noticeText.ready('Weekly #40', 'Alpha', 'Bravo'), /^【Weekly #40】比赛就绪：Alpha vs Bravo/);
  assert.match(noticeText.confirm('W', 'Alpha', 2, 1, 'Bravo'), /Alpha 2 : 1 Bravo/);
  assert.match(noticeText.result('W', 'Alpha', 2, 1, 'Bravo', 'Alpha'), /Alpha 2 : 1 Bravo，Alpha 胜出$/);
  assert.match(noticeText.walkover('W', 'Alpha', 'Bravo'), /Alpha 不战而胜（Bravo 弃权）/);
  assert.match(noticeText.ban('W', 'Bravo', 'Alpha 禁用了 USA'), /轮到 Bravo 禁用（Alpha 禁用了 USA）/);
  assert.match(noticeText.soon('W', '20:00', true), /20:00 开始，开赛前 30 分钟开放签到/);
  assert.doesNotMatch(noticeText.soon('W', '20:00', false), /签到/);
  for (const text of [noticeText.ready('W', 'a', 'b'), noticeText.confirm('W', 'a', 1, 0, 'b')]) {
    assert.doesNotMatch(text, /https?:/, 'no links in notices');
  }
});

test('the hour-before reminder goes out once per event, inside the window only', async () => {
  // 2026-11-14 20:00 Beijing time = 12:00 UTC.
  const events = [{ id: 'w40', name: 'Weekly #40', scheduled_time: '2026-11-14T20:00', checkin_enabled: true }];
  const claimed = new Set();
  await withToken(async () => {
    const early = db({ players, events, registered: ['Alpha', 'Bravo'], claimed });
    assert.equal(await queueEventReminders(early, Date.UTC(2026, 10, 14, 10, 30)), 0, '90 minutes before: not yet');
    const due = db({ players, events, registered: ['Alpha', 'Bravo', 'Charlie'], claimed });
    assert.equal(await queueEventReminders(due, Date.UTC(2026, 10, 14, 11, 15)), 1);
    assert.equal(due.inserted[0].kind, 'soon');
    assert.match(due.inserted[0].text, /Weekly #40】将在 20:00 开始/);
    assert.deepEqual(due.inserted[0].mentions, ['10001', '10002']);
    const again = db({ players, events, registered: ['Alpha'], claimed });
    assert.equal(await queueEventReminders(again, Date.UTC(2026, 10, 14, 11, 20)), 0, 'once per event');
  });
});
