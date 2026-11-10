import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertText, needsAdmin, pendingItems } from '../lib/admin-alerts.js';
import { parseBackupName, STALE_MS, summarize } from '../lib/backup-status.js';

const row = (id, pending_report) => ({ match_id: id, tournament_id: 't', tournament: 'Weekly', player1_id: 'A', player2_id: 'B', pending_report });

test('matches waiting for an admin: disputes and walkover claims', () => {
  assert.equal(needsAdmin({ kind: 'score', disputed: false }), false);
  assert.equal(needsAdmin({ kind: 'score', disputed: true }), true);
  assert.equal(needsAdmin({ kind: 'walkover' }), true);
  assert.equal(needsAdmin(null), false);
  const items = pendingItems([
    row(1, { kind: 'score', by: 'A', at: '2026-11-11T10:05:00Z', disputed: false }),
    row(2, { kind: 'walkover', winner_id: 'B', by: 'B', at: '2026-11-11T10:03:00Z' }),
    row(3, { kind: 'score', by: 'A', at: '2026-11-11T10:00:00Z', disputed: true, counter: { kind: 'score', by: 'B', at: '2026-11-11T10:04:00Z' } }),
  ]);
  assert.deepEqual(items.map((i) => [i.match_id, i.kind]), [[2, 'walkover'], [3, 'dispute']]);
  assert.equal(items[1].at, '2026-11-11T10:04:00Z');
});

test('alert texts name both sides and who disagreed', () => {
  const t = alertText('Weekly', { kind: 'score', score1: 2, score2: 1, by: 'A', disputed: true, counter: { by: 'B' } }, 'A', 'B');
  assert.match(t, /^【Weekly】需要管理员处理：A vs B 的结果有异议（A 报 2 : 1，B 不同意）/);
  assert.match(alertText('Weekly', { kind: 'walkover', winner_id: 'B', by: 'B' }, 'A', 'B'), /B 在 A vs B 申报对手弃权/);
  assert.match(alertText('W', { kind: 'score', score1: 2, score2: 0, by: 'A', disputed: true, disputed_by: 'admin' }, 'A', 'B'), /对手不同意/);
});

test('backups: file names, newest first, stale after 36 hours', () => {
  assert.deepEqual(parseBackupName('suck-db-20261110-041700-daily.dump'), { label: 'daily', stamp: '2026-11-10 04:17' });
  assert.equal(parseBackupName('suck-db-20261110-041700-daily.dump.part'), null);
  const now = Date.parse('2026-11-11T12:00:00Z');
  const s = summarize([
    { name: 'suck-db-20261109-041700-daily.dump', size: 10, mtime: Date.parse('2026-11-09T04:17:00Z') },
    { name: 'suck-db-20261111-090000-pre-deploy.dump', size: 12, mtime: Date.parse('2026-11-11T09:00:00Z') },
    { name: 'notes.txt', size: 1, mtime: now },
  ], now);
  assert.equal(s.count, 2);
  assert.equal(s.latest.label, 'pre-deploy');
  assert.equal(s.latestDaily.file, 'suck-db-20261109-041700-daily.dump');
  assert.equal(s.stale, false);
  assert.equal(summarize([], now).stale, true);
  assert.equal(summarize([{ name: 'suck-db-20261101-041700-daily.dump', size: 1, mtime: now - STALE_MS - 1 }], now).stale, true);
});
