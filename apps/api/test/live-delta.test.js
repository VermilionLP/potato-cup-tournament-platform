import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveDelta, SINCE_MARGIN_MS } from '../lib/live-delta.js';

test('a live delta keeps the event, drops players and votes, sends changed matches', () => {
  const since = new Date('2026-11-05T12:00:00Z');
  const old = new Date(since.getTime() - SINCE_MARGIN_MS - 1000).toISOString();
  const recent = new Date(since.getTime() - 1000).toISOString();
  const detail = {
    id: 't', status: 'in_progress', standings: [1],
    players: [{ id: 'a' }], votes: [{}],
    matches: [{ id: 3, updated_at: old }, { id: 1, updated_at: recent }, { id: 2 }],
  };
  const d = liveDelta(detail, since);
  assert.equal(d.players, undefined);
  assert.equal(d.votes, undefined);
  assert.equal(d.matches, undefined);
  assert.deepEqual(d.match_ids, [3, 1, 2]);
  assert.deepEqual(d.changed_matches.map((m) => m.id), [1, 2]);
  assert.equal(d.status, 'in_progress');
  assert.deepEqual(d.standings, [1]);
  assert.equal(d.delta, true);
});
