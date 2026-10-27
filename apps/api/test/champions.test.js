import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isQualifierEvent, tournamentChampion } from '../lib/champions.js';

const done = { status: 'completed' };
test('champion by format', () => {
  const se = [{ bracket: 'main', round: 1, position: 1, winner_id: 'a', status: 'completed' }, { bracket: 'main', round: 2, position: 1, winner_id: 'b', status: 'completed' }];
  assert.equal(tournamentChampion({ ...done, format: 'single_elim' }, se), 'a');
  const de = [
    { bracket: 'gf', round: 1, position: 1, winner_id: 'lb', status: 'completed' },
    { bracket: 'gf', round: 1, position: 2, winner_id: 'wb', status: 'completed' },
  ];
  assert.equal(tournamentChampion({ ...done, format: 'double_elim' }, de), 'wb', 'bracket reset decides');
  assert.equal(tournamentChampion({ ...done, format: 'double_elim' }, de.slice(0, 1)), 'lb');
  // Two-stage: group brackets are ignored, the playoff decides.
  const two = [{ bracket: 'gwb', round: 1, position: 1, winner_id: 'g', status: 'completed', swiss_group: 1 }, ...se];
  assert.equal(tournamentChampion({ ...done, format: 'double_elim', playoff_format: 'single_elim' }, two), 'a');
  const sw = [
    { bracket: 'sw', round: 1, position: 1, player1_id: 'x', player2_id: 'y', score1: 2, score2: 0, winner_id: 'x', status: 'completed' },
  ];
  assert.equal(tournamentChampion({ ...done, format: 'swiss' }, sw, [{ id: 'x', seed: 2 }, { id: 'y', seed: 1 }]), 'x');
  assert.equal(tournamentChampion({ status: 'in_progress', format: 'single_elim' }, se), null);
});

test('qualifiers are not titles', () => {
  assert.ok(isQualifierEvent({ source_title: 'Potato Cup/2024/Autumn/Prop/Qualifier/1' }));
  assert.ok(isQualifierEvent({ name: '春季赛资格赛' }));
  assert.ok(!isQualifierEvent({ name: 'Potato Cup Weekly #36' }));
});
