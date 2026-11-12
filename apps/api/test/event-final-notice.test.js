import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalRows, notifyEventFinished } from '../lib/event-final-notice.js';
import { noticeBatches, noticeText } from '../lib/bot-notices.js';

// A 4-player single elimination: A beats B in the final, C and D lost the semis.
const event = {
  id: 'w1', name: 'Weekly #40', status: 'completed', format: 'single_elim', played_at: '2026-11-12T12:00:00Z',
  points_table: [{ from: 1, to: 1, points: 10, prize: 500 }, { from: 2, to: 2, points: 6 }, { from: 3, to: 4, points: 3 }],
};
const players = ['A', 'B', 'C', 'D'].map((id, i) => ({ id, seed: i + 1, flag: 'cn', display_name: id }));
const m = (round, position, p1, p2, winner) => ({ bracket: 'main', round, position, player1_id: p1, player2_id: p2, winner_id: winner, status: 'completed', score1: 2, score2: 1 });
const matches = [m(1, 1, 'A', 'B', 'A'), m(2, 1, 'A', 'D', 'A'), m(2, 2, 'B', 'C', 'B')];

test('final placings: champion first, shared places, points and prize', () => {
  const rows = finalRows(event, players, matches);
  assert.deepEqual(rows.map((r) => [r.id, r.place, r.points, r.prize]), [['A', '1', 10, 500], ['B', '2', 6, 0], ['C', '3-4', 3, 0], ['D', '3-4', 3, 0]]);
  assert.deepEqual(finalRows({ ...event, status: 'in_progress' }, players, matches), []);
});

test('final text names the podium', () => {
  const text = noticeText.final('Weekly #40', finalRows(event, players, matches).filter((r) => r.from <= 3));
  assert.match(text, /【Weekly #40】比赛结束！\n冠军 A\n亚军 B\n第 3-4 名 C \/ D\n/);
});

test('the final notice keeps its data for the picture', () => {
  const [b] = noticeBatches([{ id: 1, kind: 'final', tournament_id: 'w1', text: 't', mentions: [], data: { rows: [1] } }]);
  assert.deepEqual(b.data, { rows: [1] });
  const [r] = noticeBatches([{ id: 2, kind: 'result', tournament_id: 'w1', text: 't', mentions: [], data: { line: 'x' } }]);
  assert.equal(r.data, undefined);
});

test('queued once per event and champion, with the podium @-ed', async () => {
  const prev = process.env.BOT_TOKEN;
  process.env.BOT_TOKEN = 'x'.repeat(32);
  const claimed = new Set();
  const inserted = [];
  const db = {
    async query(sql, params = []) {
      if (/INSERT INTO axsuck\.push_reminders/.test(sql)) {
        const key = params.join('|');
        if (claimed.has(key)) return { rowCount: 0, rows: [] };
        claimed.add(key);
        return { rowCount: 1, rows: [{}] };
      }
      if (/FROM axsuck\.players/.test(sql)) return { rows: params[0].map((id) => ({ id, contact: `QQ: 1000${id.charCodeAt(0)}` })) };
      if (/INSERT INTO axsuck\.bot_notices/.test(sql)) {
        inserted.push({ kind: params[0], mentions: params[3], data: JSON.parse(params[5]) });
        return { rows: [{ id: inserted.length }] };
      }
      return { rows: [] };
    },
  };
  try {
    assert.ok(await notifyEventFinished(db, { event, players, matches }, { error() {} }));
    assert.equal(await notifyEventFinished(db, { event, players, matches }, { error() {} }), null);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].kind, 'final');
    assert.equal(inserted[0].data.rows.length, 4);
    assert.equal(inserted[0].data.players, 4);
  } finally {
    if (prev === undefined) delete process.env.BOT_TOKEN; else process.env.BOT_TOKEN = prev;
  }
});
