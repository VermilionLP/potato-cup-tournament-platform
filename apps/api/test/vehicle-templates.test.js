import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, normalizeRules, normalizeTemplate, resolveTemplate } from '../lib/vehicle-pools.js';

const options = { eventTypes: ['prop', 'legacy-jet', 'proleague'], gameModes: ['ab', 'rb', 'sb'] };

test('rules get defaults and stay in range', () => {
  assert.deepEqual(normalizeRules(), DEFAULT_RULES);
  assert.deepEqual(normalizeRules({ bansPerPlayer: 2, groupRerolls: 1, vehicleRerolls: '0', drawVehicle: false }), {
    bansPerPlayer: 2, groupRerolls: 1, vehicleRerolls: 0, drawVehicle: false,
  });
  assert.equal(normalizeRules({ bansPerPlayer: 9 }).bansPerPlayer, 1);
  assert.equal(normalizeRules({ groupRerolls: -1 }).groupRerolls, null);
});

test('templates are checked; updates may be partial', () => {
  const ok = normalizeTemplate({ name: ' AB 螺旋桨 ', event_type: 'prop', game_modes: ['ab', 'ab'], vehicles: [{ name: 'Yak-3' }] }, options);
  assert.equal(ok.template.name, 'AB 螺旋桨');
  assert.deepEqual(ok.template.game_modes, ['ab']);
  assert.equal(ok.template.vehicles[0].group, 'Yak-3');
  assert.deepEqual(ok.template.rules, DEFAULT_RULES);
  assert.match(normalizeTemplate({ name: 'x', event_type: 'tank', vehicles: [{ name: 'a' }] }, options).error, /比赛类型/);
  assert.match(normalizeTemplate({ name: 'x', event_type: 'prop', game_modes: ['pve'], vehicles: [{ name: 'a' }] }, options).error, /游戏模式/);
  assert.match(normalizeTemplate({ name: '', event_type: 'prop', vehicles: [{ name: 'a' }] }, options).error, /名称/);
  assert.deepEqual(normalizeTemplate({ name: '新名字' }, { ...options, partial: true }).template, { name: '新名字' });
});

test('events use the most specific template unless one is chosen', () => {
  const templates = [
    { id: 'prop', event_type: 'prop', game_modes: [], sort_order: 10 },
    { id: 'prop-ab', event_type: 'prop', game_modes: ['ab'], sort_order: 20 },
    { id: 'bvr', event_type: 'proleague', game_modes: [], sort_order: 40 },
    { id: 'bvr-sb', event_type: 'proleague', game_modes: ['sb'], sort_order: 50 },
  ];
  assert.equal(resolveTemplate(templates, { vehicle_pool: 'prop', game_mode: 'ab' }).id, 'prop-ab');
  assert.equal(resolveTemplate(templates, { vehicle_pool: 'prop', game_mode: 'rb' }).id, 'prop');
  assert.equal(resolveTemplate(templates, { vehicle_pool: 'proleague', game_mode: 'rb' }).id, 'bvr');
  assert.equal(resolveTemplate(templates, { vehicle_pool: 'prop', game_mode: 'rb', vehicle_template: 'bvr-sb' }).id, 'bvr-sb');
  assert.equal(resolveTemplate(templates, { vehicle_pool: 'prop', game_mode: 'ab', vehicle_template: 'gone' }).id, 'prop-ab');
  assert.equal(resolveTemplate(templates, { vehicle_pool: 'legacy-jet', game_mode: 'rb' }), null);
  // Only mode-specific templates of the type: the first one is used.
  assert.equal(resolveTemplate([templates[1]], { vehicle_pool: 'prop', game_mode: 'rb' }).id, 'prop-ab');
});
