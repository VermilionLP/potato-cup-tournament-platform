import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bracketSettingsProblem, normalizeBracketSettings } from '../lib/bracket-settings.js';

test('the bracket settings are checked as at creation', () => {
  assert.equal(bracketSettingsProblem({ format: 'single_elim' }), '');
  assert.match(bracketSettingsProblem({ format: 'round_robin' }), /format must be one of/);
  assert.match(bracketSettingsProblem({ format: 'swiss', swiss_rounds: 99 }), /瑞士轮轮数/);
  assert.equal(bracketSettingsProblem({ format: 'swiss', swiss_rounds: null }), '');
  assert.match(bracketSettingsProblem({ format: 'swiss', playoff_format: 'single_elim', swiss_group_size: 4, advance_per_group: 5 }), /不能多于每组人数/);
  assert.match(bracketSettingsProblem({ format: 'swiss', playoff_format: 'single_elim', swiss_group_size: 4 }), /每组晋级人数/);
  assert.equal(bracketSettingsProblem({ format: 'double_elim', playoff_format: 'single_elim', swiss_group_size: 4, advance_per_group: 2 }), '');
});

test('stored values: options only where the format has them', () => {
  assert.deepEqual(normalizeBracketSettings({ format: 'double_elim' }), {
    format: 'double_elim', loser_advances: 0, grand_final_reset: true, swiss_rounds: null, playoff_format: null, swiss_group_size: null, advance_per_group: null,
  });
  assert.equal(normalizeBracketSettings({ format: 'double_elim', grand_final_reset: false }).grand_final_reset, false);
  assert.equal(normalizeBracketSettings({ format: 'single_elim', loser_advances: 1 }).loser_advances, 1);
  // Switching away from a format drops its options.
  assert.equal(normalizeBracketSettings({ format: 'single_elim', grand_final_reset: true }).grand_final_reset, false);
  assert.equal(normalizeBracketSettings({ format: 'double_elim', loser_advances: 1 }).loser_advances, 0);
  assert.equal(normalizeBracketSettings({ format: 'single_elim', swiss_rounds: 5 }).swiss_rounds, null);
  assert.equal(normalizeBracketSettings({ format: 'swiss', swiss_rounds: 5 }).swiss_rounds, 5);
  assert.deepEqual(normalizeBracketSettings({ format: 'swiss', playoff_format: 'double_elim', swiss_group_size: 4, advance_per_group: 2 }), {
    format: 'swiss', loser_advances: 0, grand_final_reset: true, swiss_rounds: null, playoff_format: 'double_elim', swiss_group_size: 4, advance_per_group: 2,
  });
});
