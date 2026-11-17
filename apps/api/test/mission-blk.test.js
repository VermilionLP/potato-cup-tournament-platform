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

// Trimmed from a community duel map (the "gladiators" template, Kursk 2x2,
// with the 1x1 "first hit wins" group), CRLF line ends like the real files.
const duel = readFileSync(new URL('./fixtures/mission-duel.blk', import.meta.url), 'utf8');

test('the duel template\'s settings are read; other maps have none', () => {
  assert.deepEqual(missionSummary(duel).duel, {
    firstCountdown: 7,
    countdown: 7,
    shootingDelay: 35,
    forfeitAfter: 3600,
    firstHit: true,
    bailoutDelay: 3,
    spawnAltitude: 1500,
    spawnDistance: 7000,
    areaRadius: 6500,
  });
  assert.equal(missionSummary(joust).duel, null);
  // Without the "first hit wins" group those two are null.
  const plain = duel.replace(/    first_hit_wins\{[\s\S]*?\r\n    \}\r\n  \}\r\n\}/, '  }\r\n}');
  assert.equal(missionSummary(plain).duel.firstHit, null);
  assert.equal(missionSummary(plain).duel.bailoutDelay, null);
  assert.throws(() => applyMissionEdits(plain, { duel: { firstHit: false } }), /没有/);
});

test('duel settings change every place that sets them, nothing else', () => {
  const out = applyMissionEdits(duel, { duel: { firstCountdown: 1, countdown: 10, shootingDelay: 20, forfeitAfter: 600, firstHit: false, bailoutDelay: 1.5 } });
  const d = missionSummary(out).duel;
  assert.equal(d.firstCountdown, 1, 'the mission start\'s countdown');
  assert.equal(d.countdown, 10, 'between rounds');
  assert.match(out, /round_01_init\{[\s\S]*?value:i=1\r\n {10}var:t="timer"/);
  assert.equal(d.shootingDelay, 20);
  assert.equal(d.forfeitAfter, 600);
  assert.equal(d.firstHit, false);
  assert.equal(d.bailoutDelay, 1.5);
  assert.equal((out.match(/value:i=10\r\n {10,12}var:t="timer"/g) || []).length, 1);
  assert.equal((out.match(/value:i=600\r\n {10,12}var:t="disqualification_timer"/g) || []).length, 2);
  assert.equal((out.match(/time:r=1\.5\r\n/g) || []).length, 2, 'both bail-out waits');
  // The group and its three self-running triggers are off; hit_timer as it was.
  assert.match(out, /first_hit_wins\{\r\n      isCategory:b=yes\r\n      is_enabled:b=no/);
  const group = out.slice(out.indexOf('first_hit_wins{'));
  assert.equal((group.match(/is_enabled:b=no\r\n {8}comments/g) || []).length, 4, 'check_t1, check_t2, t1_and_t2_hit, hit_timer');
  assert.match(out, /time_stop\{\r\n {8}is_enabled:b=no/, 'other triggers untouched');
  // The variables block and other lines stay the same; CRLF stays.
  assert.match(out, /variables\{\r\n  timer:i=1\r\n  shooting_timer:i=1/);
  assert.equal(out.split('\r\n').length, duel.split('\r\n').length);
  assert.ok(!/[^\r]\n/.test(out));
});

test('spawn distance and altitude move both teams evenly; the area keeps its kill border', () => {
  const out = applyMissionEdits(duel, { duel: { spawnDistance: 3000, spawnAltitude: 2500, areaRadius: 5000 } });
  const d = missionSummary(out).duel;
  assert.equal(d.spawnDistance, 3000);
  assert.equal(d.spawnAltitude, 2500);
  assert.equal(d.areaRadius, 5000);
  // Halfway point unchanged (z 2094), each team 2000 m closer, rotation kept.
  assert.match(out, /t1_air_spawn_01\{\r\n    type:t="Sphere"\r\n    tm:m=\[\[2\.38339e-07, 0, 30\] \[0, 30, 0\] \[-30, 0, 2\.38339e-07\] \[3359\.7, 2500, 594\]\]/);
  assert.match(out, /t2_air_spawn_02\{\r\n    type:t="Sphere"\r\n    tm:m=\[\[-4\.76837e-07, 0, -30\] \[0, 30, 0\] \[30, 0, -4\.76837e-07\] \[3359\.8, 2500, 3594\]\]/);
  // Kill border stays 900 m outside the area; height and centre unchanged
  // (numbers that didn't change keep their exact text).
  assert.match(out, /battle_area_01\{[\s\S]*?tm:m=\[\[5000, 0, 0\] \[0, 5000, 0\] \[0, 0, 5000\] \[3330, 1\.52588e-05, 2094\]\]/);
  assert.match(out, /battle_area_destr_01\{[\s\S]*?tm:m=\[\[5900, 0, 0\] \[0, 5000, 0\] \[0, 0, 5900\]/);
  assert.throws(() => applyMissionEdits(duel, { duel: { spawnDistance: 50 } }), /200-60000/);
  assert.throws(() => applyMissionEdits(duel, { duel: { shootingDelay: 2.5 } }), /整数/);
  assert.throws(() => applyMissionEdits(joust, { duel: { countdown: 5 } }), /没有/);
});
