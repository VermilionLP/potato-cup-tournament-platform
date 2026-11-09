import test from 'node:test';
import assert from 'node:assert/strict';
import { canSeeContacts, contactFor, publicPlayer, withoutContact } from '../lib/player-privacy.js';

test('IP addresses only for admins', () => {
  const row = { id: 'a', display_name: 'A', last_ip: '1.2.3.4', last_seen_at: '2026-11-01' };
  assert.deepEqual(publicPlayer(row), { id: 'a', display_name: 'A', last_seen_at: '2026-11-01' });
  assert.equal(publicPlayer(row, true).last_ip, '1.2.3.4');
  assert.equal(row.last_ip, '1.2.3.4', 'the row itself is not changed');
  assert.equal(publicPlayer(null), null);
});

test('contacts: guests get battle_tags without QQ / Discord', () => {
  assert.equal(withoutContact('{"qq":"123","discord":"x","display_name":"Ace"}'), '{"display_name":"Ace"}');
  assert.deepEqual(withoutContact({ qq: '1', name: 'A' }), { name: 'A' });
  assert.equal(withoutContact('not json'), 'not json');
  assert.equal(withoutContact(null), null);
  const row = { id: 'p', battle_tags: '{"qq":"1"}' };
  assert.equal(contactFor(row, true), row);
  assert.deepEqual(contactFor(row, false), { id: 'p', battle_tags: '{}' });
  assert.deepEqual(contactFor({ id: 'q' }, false), { id: 'q' });
});

test('contacts: admins and signed-in players (key when bound) may see them', async () => {
  const db = { query: async (_sql, [id]) => ({ rows: id === 'known' ? [{}] : [] }) };
  const ctx = (admin, id, key = true) => ({ isAdmin: () => admin, requesterId: () => id, keyOk: async () => key });
  assert.equal(await canSeeContacts(db, {}, ctx(true, null)), true);
  assert.equal(await canSeeContacts(db, {}, ctx(false, null)), false);
  assert.equal(await canSeeContacts(db, {}, ctx(false, 'stranger')), false);
  assert.equal(await canSeeContacts(db, {}, ctx(false, 'known')), true);
  assert.equal(await canSeeContacts(db, {}, ctx(false, 'known', false)), false);
});
