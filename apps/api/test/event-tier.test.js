import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultTier, kindOf, liquipediaTierOf, normalizeKind, normalizeTier, statsScope, tierFallback } from '../lib/event-tier.js';
import { isQualifierEvent } from '../lib/champions.js';

test('tiers: S-D, also from Liquipedia 1-5', () => {
  assert.equal(normalizeTier('b'), 'B');
  assert.equal(normalizeTier('2'), 'A');
  assert.equal(normalizeTier(4), 'C');
  for (const bad of ['', 'E', '6', null, 'x']) assert.equal(normalizeTier(bad), null);
  assert.equal(liquipediaTierOf('A'), '2');
  assert.equal(liquipediaTierOf(null), '');
  assert.equal(normalizeKind('Weekly'), 'weekly');
  assert.equal(normalizeKind('cup'), null);
});

test('kind from the page: weekly, qualifier, monthly cup, season, misc', () => {
  assert.equal(kindOf({ title: 'Potato Cup Weekly/34/Beginners', tiertype: 'Weekly' }), 'weekly');
  assert.equal(kindOf({ title: 'Potato Cup/2024/Autumn/Jet/Qualifier/Round 1', tiertype: 'Qualifier' }), 'qualifier');
  assert.equal(kindOf({ title: 'Potato Cup/2026/Fall/Europe' }), 'monthly');
  assert.equal(kindOf({ title: 'Potato Cup/2026/June/Asia Pacific' }), 'monthly');
  assert.equal(kindOf({ title: 'Potato Cup/2025/Spring/Prop/Advanced Group' }), 'season');
  assert.equal(kindOf({ title: 'Potato Cup/2026/Winter/Legacy Jet' }), 'season');
  assert.equal(kindOf({ title: 'Potato Cup/2024/Lunar New Year Cup' }), 'misc');
  assert.equal(kindOf({ title: 'Something', pointsKind: 'monthly' }), 'monthly');
  assert.equal(tierFallback({ title: 'Potato Cup/2025/Summer/Jet/Intermediate Group', kind: 'season' }), 'B');
  assert.equal(tierFallback({ title: 'Potato Cup/2025/Summer/Jet/Beginners Group', kind: 'season' }), 'C');
  assert.equal(tierFallback({ title: 'Potato Cup/2024/Summer', kind: 'season' }), null);
});

test('new events: tier and kind as given, else from the points table', () => {
  assert.deepEqual(defaultTier({ pointsKind: 'monthly' }), { tier: 'B', kind: 'monthly' });
  assert.deepEqual(defaultTier({ pointsKind: 'weekly' }), { tier: 'C', kind: 'weekly' });
  assert.deepEqual(defaultTier({ name: 'Potato Cup Weekly #40' }), { tier: 'C', kind: 'weekly' });
  assert.deepEqual(defaultTier({ name: 'Fun cup' }), { tier: null, kind: null });
  assert.deepEqual(defaultTier({ tier: 'A', kind: 'season', pointsKind: 'weekly' }), { tier: 'A', kind: 'season' });
});

test('statistics scope by tier and kind', () => {
  const events = [{ id: 1, tier: 'A', event_kind: 'season' }, { id: 2, tier: 'C', event_kind: 'weekly' }, { id: 3, tier: null, event_kind: null }];
  const ids = (q) => events.filter(statsScope(q)).map((e) => e.id);
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ tier: 'a' }), [1]);
  assert.deepEqual(ids({ tier: 'none' }), [3]);
  assert.deepEqual(ids({ kind: 'weekly' }), [2]);
  assert.deepEqual(ids({ tier: 'C', kind: 'season' }), []);
  assert.deepEqual(ids({ tier: 'bogus' }), [1, 2, 3], 'unknown values are ignored');
  assert.equal(statsScope({ tier: '3' }).tier, 'B');
});

test('qualifiers: by kind when set, else by name', () => {
  assert.equal(isQualifierEvent({ event_kind: 'qualifier', name: 'X' }), true);
  assert.equal(isQualifierEvent({ event_kind: 'season', name: 'Spring Qualifier' }), false);
  assert.equal(isQualifierEvent({ name: 'Spring 预选赛' }), true);
});
