import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { applyMissionEdits, levelName, missionProblems, missionSummary, parseUnitList, scanBlocks } from '@potato-cup/shared/mission-blk.js';

// Trimmed from TheArena's 1v1 Joust (desert): the real file's layout.
const joust = readFileSync(new URL('./fixtures/mission-joust.blk', import.meta.url), 'utf8');

test('a mission file is read: settings, unit types and both teams\' vehicles', () => {
  assert.deepEqual(missionProblems(joust), []);
  const s = missionSummary(joust);
  assert.equal(s.name, 'JoustDesert_by_Demonuk');
  assert.equal(levelName(s.level), 'air_africa_desert');
  assert.equal(s.type, 'domination');
  assert.deepEqual(s.unitTypes, { air: true, ground: false, naval: false, helicopters: false });
  assert.equal(s.fields.locName, '1v1 Joust by TheArena (Desert)');
  assert.equal(s.fields.scoreLimit, 3);
  assert.equal(s.fields.timeLimit, 60);
  assert.equal(s.fields.isBotsAllowed, false);
  assert.equal(s.fields.weather, 'hazy');
  assert.deepEqual(s.units, { teamA: ['f_15e', 'su_27sm', 'j_10c'], teamB: ['f_15e', 'su_27sm', 'j_10c'] });
});

test('edits change only their lines; the rest of the file stays byte for byte', () => {
  const out = applyMissionEdits(joust, { fields: { scoreLimit: 5, weather: 'clear', locName: 'Potato Joust', isBotsAllowed: true } });
  const s = missionSummary(out);
  assert.equal(s.fields.scoreLimit, 5);
  assert.equal(s.fields.weather, 'clear');
  assert.equal(s.fields.locName, 'Potato Joust');
  assert.equal(s.fields.isBotsAllowed, true);
  const changed = out.split('\n').filter((line, i) => line !== joust.split('\n')[i]);
  assert.deepEqual(changed, ['    locName:t="Potato Joust"', '    weather:t="clear"', '    scoreLimit:i=5', '    isBotsAllowed:b=yes'].sort((a, b) => out.indexOf(a) - out.indexOf(b)));
  // A setting the file does not have yet goes into mission{}.
  const noTime = joust.replace('    timeLimit:i=60\n', '');
  assert.equal(missionSummary(noTime).fields.timeLimit, null);
  assert.equal(missionSummary(applyMissionEdits(noTime, { fields: { timeLimit: 30 } })).fields.timeLimit, 30);
});

test('vehicle lists are replaced per team', () => {
  const out = applyMissionEdits(joust, { units: { teamA: 'f_16c_block_52_aesa, su_27sm\nsu_27sm', teamB: ['mig_29smt_9_19'] } });
  assert.deepEqual(missionSummary(out).units, { teamA: ['f_16c_block_52_aesa', 'su_27sm'], teamB: ['mig_29smt_9_19'] });
  assert.match(out, /unlimitedUnits\{\n {10}f_16c_block_52_aesa:b=yes\n {10}su_27sm:b=yes\n {8}\}/);
  assert.deepEqual(missionProblems(out), []);
  assert.throws(() => parseUnitList('f_15e su-27"x'), /载具 ID/);
  const noRules = joust.replace(/ {2}customRules\{[\s\S]*?\n {2}\}\n/, '');
  assert.equal(missionSummary(noRules).units, null);
  assert.throws(() => applyMissionEdits(noRules, { units: { teamA: ['f_15e'] } }), /没有载具列表/);
});

test('bad values and broken files are refused in words', () => {
  assert.throws(() => applyMissionEdits(joust, { fields: { scoreLimit: 0 } }), /1-1000/);
  assert.throws(() => applyMissionEdits(joust, { fields: { timeLimit: 1.5 } }), /整数/);
  assert.throws(() => applyMissionEdits(joust, { fields: { locName: 'a"b' } }), /引号/);
  assert.throws(() => applyMissionEdits(joust, { fields: { weather: 'clear sky' } }), /英文字母/);
  assert.throws(() => applyMissionEdits(joust, { fields: { level: 'x' } }), /不能修改/);
  assert.match(missionProblems(joust.replace('  atmosphere{', '  atmosphere')).join(), /多了一个 \}/);
  assert.match(missionProblems(joust.replace('pressure:r=760\n', 'pressure:r=760\n  inner{\n')).join(), /没有对应的 \}/);
  assert.match(missionProblems('a:t="x\n').join(), /引号没有结束/);
  assert.match(missionProblems('').join(), /空的/);
  assert.match(missionProblems('triggers{\n}\n').join(), /mission_settings/);
  // Braces in text and comments do not count.
  assert.equal(scanBlocks('a{\n b:t="{"\n // }\n /* } */\n}\n').error, null);
  // Windows line endings.
  assert.equal(missionSummary(joust.replace(/\n/g, '\r\n')).fields.scoreLimit, 3);
});

test('the vehicle limit turns off (customRules removed) and back on (the old block, or a new one)', async () => {
  const { vehicleLimitBlock } = await import('@potato-cup/shared/mission-blk.js');
  const old = vehicleLimitBlock(joust);
  assert.match(old, /^ {2}customRules\{\n[\s\S]*unlimitedUnits[\s\S]*\n {2}\}\n$/);
  const off = applyMissionEdits(joust, { vehicleLimit: false });
  assert.deepEqual(missionProblems(off), []);
  const s = missionSummary(off);
  assert.equal(s.vehicleLimit, false);
  assert.equal(s.units, null);
  assert.equal(s.fields.scoreLimit, 3, 'the rest stays');
  assert.equal(off, joust.replace(old, ''), 'only the block goes');
  // On again with the old block: the file is as before.
  assert.equal(applyMissionEdits(off, { vehicleLimit: true, limitBlock: old }), joust);
  // On again with a new list (no old block): a sharedPool rule for both teams.
  const fresh = applyMissionEdits(off, { vehicleLimit: true, units: { teamA: 'f_15e\nj_10c' } });
  assert.deepEqual(missionSummary(fresh).units, { teamA: ['f_15e', 'j_10c'], teamB: ['f_15e', 'j_10c'] });
  assert.match(fresh, / {4}customRules\{\n {6}name:t="sharedPool"\n {6}teams\{\n {8}teamA\{\n {10}unlimitedUnits\{\n {12}f_15e:b=yes/);
  assert.throws(() => applyMissionEdits(off, { vehicleLimit: true }), /请填写可用的载具/);
  assert.throws(() => applyMissionEdits(joust, { units: { teamA: [] } }), /至少要有一个载具/);
  // Already on / already off: nothing changes.
  assert.equal(applyMissionEdits(joust, { vehicleLimit: true }), joust);
  assert.equal(applyMissionEdits(off, { vehicleLimit: false }), off);
});

test('time of day can be an hour (the game menu offers 7-18)', () => {
  const out = applyMissionEdits(joust, { fields: { environment: '7', weather: 'cloudy_windy' } });
  assert.match(out, /environment:t="7"/);
  assert.match(out, /weather:t="cloudy_windy"/);
  assert.throws(() => applyMissionEdits(joust, { fields: { environment: '7 pm' } }), /英文字母/);
});
