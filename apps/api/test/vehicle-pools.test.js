import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_POOL_VEHICLES, normalizeVehicles } from '../lib/vehicle-pools.js';

test('vehicles are cleaned for storage', () => {
  const { vehicles, error } = normalizeVehicles([
    { name: '  Bf 109 E-4 ', nation: 'Germany', br: '2.3', type: 'Fighter', group: 'Bf 109 E', extra: 1 },
    { name: 'Yak-3', br: '' },
  ]);
  assert.equal(error, undefined);
  assert.deepEqual(vehicles, [
    { name: 'Bf 109 E-4', nation: 'Germany', br: 2.3, type: 'Fighter', group: 'Bf 109 E' },
    { name: 'Yak-3', nation: '', br: null, type: '', group: 'Yak-3' },
  ]);
});

test('bad lists are rejected with the row number', () => {
  assert.match(normalizeVehicles({}).error, /数组/);
  assert.match(normalizeVehicles([]).error, /至少/);
  assert.match(normalizeVehicles([{ name: 'a' }, { nation: 'USA' }]).error, /第 2 行缺少载具名称/);
  assert.match(normalizeVehicles([{ name: 'a', br: 'x' }]).error, /第 1 行（a）的 BR/);
  assert.match(normalizeVehicles([{ name: 'a', br: 99 }]).error, /BR/);
  assert.match(normalizeVehicles(Array.from({ length: MAX_POOL_VEHICLES + 1 }, () => ({ name: 'a' }))).error, /最多/);
});
