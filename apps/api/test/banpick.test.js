import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, actionProblem, effectiveEntries, emptyRecord, groupVehicles, replay } from '../lib/banpick.js';

const grouped = groupVehicles([
  { group: 'GA', name: 'a1' }, { group: 'GA', name: 'a2' },
  { group: 'GB', name: 'b1' },
  { group: 'GC', name: 'c1' }, { group: 'GC', name: 'c2' }, { group: 'GC', name: 'c1' },
]);
const rules = { bansPerPlayer: 1, groupRerolls: null, vehicleRerolls: null, drawVehicle: true };
const A = { who: { admin: false, side: 'A' }, by: 'pa' };
const B = { who: { admin: false, side: 'B' }, by: 'pb' };
const ADMIN = { who: { admin: true, side: null }, by: 'admin' };
const first = () => 0;

function run(record, input, who, rand = first) {
  const out = act(record, input, { grouped, rules, rand, at: '2026-11-05T00:00:00.000Z', ...who });
  assert.equal(out.error, undefined, out.error);
  return out.record;
}

test('groups list each name once', () => {
  assert.deepEqual(grouped.find((g) => g.group === 'GC').vehicles.map((v) => v.name), ['c1', 'c2']);
});

test('bans take turns; the server draws from what is left', () => {
  let r = emptyRecord(rules);
  assert.match(actionProblem(r, 'ban', B.who, B.by), /轮到 A/);
  r = run(r, { action: 'ban', group: 'GA', vehicle: 'a2' }, A);
  r = run(r, { action: 'ban', group: 'GB' }, B);
  assert.equal(r.state.phase, 'drawGroup');
  assert.deepEqual(r.state.bans, [{ by: 'A', group: 'GA', vehicle: 'a2' }, { by: 'B', group: 'GB', vehicle: null }]);
  r = run(r, { action: 'drawGroup' }, B);
  assert.equal(r.state.group, 'GC');
  r = run(r, { action: 'confirmGroup' }, A);
  r = run(r, { action: 'drawVehicle' }, A, () => 0.9);
  assert.equal(r.state.vehicle, 'c2');
  r = run(r, { action: 'confirm' }, B);
  assert.equal(r.state.phase, 'done');
  assert.equal(r.rev, 6);
  assert.deepEqual(r.log.map((e) => [e.n, e.action, e.by]), [
    [1, 'ban', 'pa'], [2, 'ban', 'pb'], [3, 'drawGroup', 'pb'], [4, 'confirmGroup', 'pa'], [5, 'drawVehicle', 'pa'], [6, 'confirm', 'pb'],
  ]);
  assert.equal(r.log[4].vehicle, 'c2');
  // The log replays to the same state.
  assert.deepEqual(replay(rules, r.log), r.state);
  // Done: players can't change it, admins can undo.
  assert.match(actionProblem(r, 'drawVehicle', A.who, A.by), /已确认/);
  r = run(r, { action: 'undo' }, ADMIN);
  assert.equal(r.state.phase, 'drawVehicle');
  assert.equal(r.state.vehicle, 'c2');
});

test('players undo only their own last ban; undo stays in the log', () => {
  let r = run(emptyRecord(rules), { action: 'ban', group: 'GA' }, A);
  assert.match(actionProblem(r, 'undo', B.who, B.by), /只能撤销自己/);
  r = run(r, { action: 'undo' }, A);
  assert.equal(r.state.bans.length, 0);
  assert.deepEqual(r.log.map((e) => [e.action, Boolean(e.undone)]), [['ban', true], ['undo', false]]);
  assert.equal(r.log[1].target, 1);
  assert.equal(effectiveEntries(r.log).length, 0);
  r = run(r, { action: 'pass' }, A);
  r = run(r, { action: 'ban', group: 'GC' }, B);
  r = run(r, { action: 'drawGroup' }, A);
  assert.equal(r.state.group, 'GA');
  assert.match(actionProblem(r, 'undo', A.who, A.by), /只能撤销自己/);
  r = run(r, { action: 'undo' }, ADMIN);
  assert.equal(r.state.group, null);
  assert.equal(r.state.phase, 'drawGroup');
});

test('removal limits and draw-free redraws follow the rules', () => {
  const limited = { ...rules, bansPerPlayer: 0, groupRerolls: 1 };
  const ctx = (who) => ({ grouped, rules: limited, rand: first, ...who });
  let r = emptyRecord(limited);
  r = act(r, { action: 'drawGroup' }, ctx(A)).record;
  assert.match(act(r, { action: 'drawGroup' }, ctx(A)).error, /不能/);
  r = act(r, { action: 'removeGroup' }, ctx(A)).record;
  assert.deepEqual(r.state.removedGroups, ['GA']);
  r = act(r, { action: 'drawGroup' }, ctx(B)).record;
  assert.equal(r.state.group, 'GB');
  assert.match(act(r, { action: 'removeGroup' }, ctx(B)).error, /不能/);
});

test('only admins reset; a reset uses the template rules and trims the log', () => {
  let r = run(emptyRecord(rules), { action: 'ban', group: 'GA' }, A);
  assert.match(actionProblem(r, 'reset', A.who, A.by), /管理员/);
  const newRules = { ...rules, bansPerPlayer: 0 };
  r = act(r, { action: 'reset' }, { grouped, rules: newRules, ...ADMIN }).record;
  assert.equal(r.state.phase, 'drawGroup');
  assert.equal(r.log.at(-1).action, 'reset');
  r = act(r, { action: 'reset' }, { grouped, rules: newRules, ...ADMIN }).record;
  assert.deepEqual(r.log.map((e) => e.action), ['reset', 'reset']);
  assert.match(actionProblem(r, 'undo', ADMIN.who, ADMIN.by) || act(r, { action: 'undo' }, { grouped, ...ADMIN }).error || '', /没有可以撤销/);
});

test('bad input is refused', () => {
  const r = emptyRecord(rules);
  assert.match(act(r, { action: 'ban', group: 'GZ' }, { grouped, ...A }).error, /没有这个大组/);
  assert.match(act(r, { action: 'ban', group: 'GA', vehicle: 'b1' }, { grouped, ...A }).error, /不在这个大组/);
  assert.match(act(r, { action: 'fly' }, { grouped, ...A }).error, /未知/);
  assert.match(act(r, { action: 'ban', group: 'GA' }, { grouped, who: { admin: false, side: null }, by: 'x' }).error, /两位选手/);
});
