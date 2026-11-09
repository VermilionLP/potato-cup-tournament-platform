import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, emptyRecord, groupVehicles } from '../lib/banpick.js';
import { buildBanpickStats } from '../lib/banpick-stats.js';

const grouped = groupVehicles([
  { group: 'GA', name: 'a1' }, { group: 'GB', name: 'b1' }, { group: 'GC', name: 'c1' }, { group: 'GC', name: 'c2' },
]);
const rules = { bansPerPlayer: 1, groupRerolls: null, vehicleRerolls: null, drawVehicle: true };
function play(steps) {
  let r = emptyRecord(rules);
  for (const [action, args = {}, x = 0, who = 'admin'] of steps) {
    const out = act(r, { action, ...args }, { grouped, rules, rand: () => x, who: { admin: true, side: null }, by: who });
    assert.equal(out.error, undefined, out.error);
    r = out.record;
  }
  return r;
}

test('counts bans, draws, removals and played vehicles; undone steps do not count', () => {
  const one = play([['ban', { group: 'GA' }], ['ban', { group: 'GB' }], ['drawGroup'], ['confirmGroup'], ['drawVehicle', {}, 0], ['removeVehicle'], ['drawVehicle', {}, 0.9], ['confirm']]);
  const two = play([['ban', { group: 'GA' }], ['undo'], ['ban', { group: 'GC' }], ['pass'], ['drawGroup', {}, 0], ['confirmGroup'], ['drawVehicle'], ['confirm']]);
  const rows = [
    { banpick: one, vehicle_pool: 'prop', player1_id: 'p1', player2_id: 'p2', winner_id: 'p1', status: 'completed' },
    { banpick: two, vehicle_pool: 'prop', player1_id: 'p2', player2_id: 'p1', winner_id: null, status: 'pending' },
    { banpick: emptyRecord(rules), vehicle_pool: 'jet', player1_id: 'p1', player2_id: 'p3' },
  ];
  const s = buildBanpickStats(rows, { player: 'p1' });
  assert.deepEqual(s.types, [{ type: 'prop', matches: 2 }]);
  assert.equal(s.type, 'prop');
  assert.equal(s.confirmed, 2);
  assert.deepEqual(s.groups.banned.map((g) => [g.name, g.bans]), [['GA', 1], ['GB', 1], ['GC', 1]]);
  assert.deepEqual(s.vehicles.played.map((v) => [v.name, v.played]), [['a1', 1], ['c2', 1]]);
  assert.deepEqual(s.vehicles.removed.map((v) => [v.name, v.removed]), [['c1', 1]]);
  // Every group and played vehicle for the vehicle tab; bans and passes.
  assert.deepEqual(s.groups.table.map((g) => g.name).sort(), ['GA', 'GB', 'GC']);
  assert.deepEqual(s.vehicles.table.map((v) => v.name).sort(), ['a1', 'c2']);
  assert.equal(s.bans, 3);
  assert.equal(s.passes, 1);
  // p1 banned GA (match one, side A); p2 banned GB (one, B) and GC (two, A).
  assert.deepEqual(s.banners.map((b) => [b.id, b.bans]), [['p2', 2], ['p1', 1]]);
  assert.deepEqual(s.banners[0].top.map((t) => t.group), ['GB', 'GC']);
  // p1 banned GA in match one (side A) and nothing in match two (side B passed).
  assert.deepEqual(s.player.bans, [{ group: 'GA', n: 1 }]);
  const won = s.player.vehicles.find((v) => v.name === 'c2');
  assert.deepEqual([won.played, won.wins, won.decided], [1, 1, 1]);
});

test('no data: empty boards', () => {
  const s = buildBanpickStats([]);
  assert.equal(s.matches, 0);
  assert.deepEqual(s.groups.banned, []);
  assert.deepEqual(s.groups.table, []);
  assert.deepEqual(s.banners, []);
});
