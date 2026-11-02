import test from 'node:test';
import assert from 'node:assert/strict';
import { unitIndex, withUnits } from '../lib/wt-unit-index.js';

test('fills in wiki units on the server', () => {
  const idx = { names: { p47d28: ['p-47d_28'], bf109e7: ['bf-109e-7', 'bf-109e-7_japan'] } };
  const tpl = { name: 'x', vehicles: [
    { name: 'P-47D-28', nation: 'USA' },
    { name: 'Bf 109 E-7', nation: 'Germany' },
    { name: 'Custom', wiki: 'my_unit' },
    { name: 'Unknown thing' },
  ] };
  const out = withUnits(tpl, idx);
  assert.deepEqual(out.vehicles.map((v) => v.unit), ['p-47d_28', 'bf-109e-7', 'my_unit', null]);
  assert.equal(tpl.vehicles[0].unit, undefined, 'input untouched');
  assert.equal(withUnits(null, idx), null);
});

test('the bundled index loads', () => {
  const idx = unitIndex();
  assert.ok(Object.keys(idx.names).length > 1000, 'apps/web/static/wt-units.json');
});
