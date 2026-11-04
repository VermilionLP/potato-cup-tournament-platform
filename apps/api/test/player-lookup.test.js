import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupPlayerName, normalizeName, similarity } from '../lib/player-lookup.js';

const players = [
  { id: 'Vermilion', events: 12 },
  { id: 'Neo_Sylphid', events: 3 },
  { id: 'Ace', events: 1 },
  { id: 'Acer', events: 5 },
  { id: 'TigerKing', events: 0 },
];
const aliases = [{ alias: 'OldVerm', player_id: 'Vermilion' }];

test('names compare without case and separators', () => {
  assert.equal(normalizeName(' Neo_Sylphid '), 'neosylphid');
  assert.equal(similarity('neo sylphid', 'Neo_Sylphid'), 0);
  assert.equal(similarity('Vermillion', 'Vermilion'), 1);
  assert.equal(similarity('Vermilion2', 'Vermilion'), 1);
  assert.equal(similarity('Ace', 'Acer'), null, 'short names need an exact match');
  assert.equal(similarity('TigerKing', 'Tiger'), 2, 'contains');
  assert.equal(similarity('Foo', 'Bar'), null);
});

test('exact, alias and similar players', () => {
  let r = lookupPlayerName('Vermilion', players, aliases);
  assert.equal(r.exact.id, 'Vermilion');
  assert.deepEqual(r.similar, []);

  r = lookupPlayerName('vermilion', players, aliases);
  assert.equal(r.exact, null);
  assert.equal(r.similar[0].id, 'Vermilion');
  assert.equal(r.similar[0].closeness, 0);

  r = lookupPlayerName('OldVerm', players, aliases);
  assert.equal(r.alias.player.id, 'Vermilion');

  r = lookupPlayerName('oldverm', players, aliases);
  assert.equal(r.similar[0].id, 'Vermilion');
  assert.equal(r.similar[0].via, 'OldVerm');

  r = lookupPlayerName('Ace', players, aliases);
  assert.equal(r.exact.id, 'Ace');
  assert.deepEqual(r.similar, []);

  assert.deepEqual(lookupPlayerName('  ', players), { exact: null, alias: null, similar: [] });
  assert.deepEqual(lookupPlayerName('Brand New Name', players).similar, []);
});

test('duplicate pairs suggest merging the smaller record into the bigger one', async () => {
  const { duplicatePairs } = await import('../lib/player-lookup.js');
  const list = [
    { id: 'Vermilion', events: 12 },
    { id: 'vermilion', events: 1 },
    { id: 'Vermillion', events: 0 },
    { id: 'Someone', events: 4 },
  ];
  const pairs = duplicatePairs(list);
  assert.deepEqual(pairs.map((p) => [p.from.id, p.into.id, p.closeness]), [
    ['vermilion', 'Vermilion', 0],
    ['Vermillion', 'Vermilion', 1],
    ['Vermillion', 'vermilion', 1],
  ]);
  assert.equal(duplicatePairs(list, [['Vermilion', 'vermilion']]).length, 2, 'dismissed pairs are left out');
});
