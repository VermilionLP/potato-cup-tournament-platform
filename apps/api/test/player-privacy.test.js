import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPlayer } from '../lib/player-privacy.js';

test('IP addresses only for admins', () => {
  const row = { id: 'a', display_name: 'A', last_ip: '1.2.3.4', last_seen_at: '2026-11-01' };
  assert.deepEqual(publicPlayer(row), { id: 'a', display_name: 'A', last_seen_at: '2026-11-01' });
  assert.equal(publicPlayer(row, true).last_ip, '1.2.3.4');
  assert.equal(row.last_ip, '1.2.3.4', 'the row itself is not changed');
  assert.equal(publicPlayer(null), null);
});
