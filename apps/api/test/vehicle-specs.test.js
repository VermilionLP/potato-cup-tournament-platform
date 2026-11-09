import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUnitPage, unitId, vehicleSpecsStore } from '../lib/vehicle-specs.js';

// Unit pages saved from wiki.warthunder.com (trimmed: no pictures, belts or
// economy).
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const page = (id) => readFile(join(fixtures, `wiki-${id}.html`), 'utf8');
const row = (rows, label) => rows.find((r) => r.label === label);

test('a jet: flight figures (RB and AB), thrust, limits, gun and missiles', async () => {
  const s = parseUnitPage(await page('f_16a_block_10'), 'f_16a_block_10');
  assert.equal(s.name, 'F-16A');
  assert.equal(s.rank, 'VIII');
  assert.ok(s.features.includes('Flares/Chaff'));
  assert.deepEqual(row(s.flight, 'Max speed'), { label: 'Max speed', value: '2,156 km/h', value_ab: '2,209 km/h', sub: 'at 10,973 m' });
  assert.equal(row(s.flight, 'Max altitude').value, '15,240 m');
  const engine = row(s.general, 'Engine');
  assert.equal(engine.value, 'F100-PW-220');
  assert.deepEqual(engine.details.map((d) => [d.label, d.value]), [['Type', 'Jet'], ['Maximum', '6,490 kgf'], ['Afterburner', '9,000 kgf']]);
  assert.deepEqual(row(s.general, 'Flap Speed Limit (IAS)'), { label: 'Flap Speed Limit (IAS)', value: '463 / 470 km/h', info: 'L / T' });
  assert.equal(row(s.general, 'Mach Number Limit').value, '2.2 M');
  assert.deepEqual(s.guns, [{ name: '20 mm M61A1 cannon', count: 1, ammo: '512 rounds', rate: '6,000 shots/min' }]);
  const aim9l = s.suspended.find((w) => w.name.startsWith('AIM-9L'));
  assert.equal(row(aim9l.stats, 'Guidance').value, 'IR');
  assert.equal(row(aim9l.stats, 'Aspect').value, 'All-aspects');
  assert.equal(row(aim9l.stats, 'Launch range').value, '18 km');
});

test('a prop: engine power, three flap limits, two kinds of guns', async () => {
  const s = parseUnitPage(await page('bf-109f-4'));
  assert.equal(s.name, 'Bf 109 F-4');
  assert.deepEqual(row(s.general, 'Engine').details.map((d) => [d.label, d.value]), [['Type', 'Inline, 12-cylinder'], ['Cooling type', 'Water'], ['Maximum', '1,170 hp'], ['WEP', '1,320 hp']]);
  assert.deepEqual(row(s.general, 'Flap Speed Limit (IAS)'), { label: 'Flap Speed Limit (IAS)', value: '260 / 409 / 438 km/h', info: 'L / T / C' });
  assert.deepEqual(s.guns.map((g) => [g.name, g.count, g.ammo]), [['20 mm MG 151 cannon', 1, '200 rounds'], ['7.92 mm MG 17 machine gun', 2, '1,000 rounds']]);
  assert.deepEqual(s.suspended, []);
});

test('pylons: the slot cells that take the weapon', () => {
  const html = `<main><h1 class="game-unit_name">X</h1><div class="block"><div class="block-header">Suspended armament</div>
    <table class="game-unit_slot-list"><tbody><tr><td><button data-feature-popover="&lt;div class=&quot;game-unit_popover-content&quot;&gt;&lt;div class=&quot;game-unit_chars-line&quot;&gt;&lt;div class=&quot;game-unit_chars-header&quot;&gt;Guidance&lt;/div&gt;&lt;div class=&quot;game-unit_chars-value&quot;&gt;SARH&lt;/div&gt;&lt;/div&gt;&lt;/div&gt;">AIM-7F Sparrow</button></td><td>231 kg</td>
    <td><img src="a.png"></td><td></td><td><img src="a.png"></td></tr></tbody></table></div></main>`;
  const s = parseUnitPage(html);
  assert.deepEqual(s.suspended, [{ name: 'AIM-7F Sparrow', weight: '231 kg', pylons: 2, stats: [{ label: 'Guidance', value: 'SARH' }] }]);
  assert.equal(parseUnitPage('<html><body>Not found</body></html>'), null);
});

test('unit ids: wiki names only', () => {
  assert.equal(unitId('bf-109f-4'), 'bf-109f-4');
  assert.equal(unitId('f_16a_block_10'), 'f_16a_block_10');
  for (const bad of ['', '../x', 'a/b', 'x y', null]) assert.equal(unitId(bad), null, String(bad));
});

test('the store reads the wiki once, keeps the result on disk, retries a miss after an hour', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vspec-'));
  const html = await page('bf-109f-4');
  const calls = [];
  let t = Date.parse('2026-11-10T00:00:00Z');
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/missing')) return { ok: false, status: 404 };
    return { ok: true, text: async () => html };
  };
  const store = vehicleSpecsStore({ dir, fetchImpl, now: () => t });
  const [a, b] = await Promise.all([store.get('bf-109f-4'), store.get('bf-109f-4')]);
  assert.equal(a.name, 'Bf 109 F-4');
  assert.equal(b, a);
  assert.deepEqual(calls, ['https://wiki.warthunder.com/unit/bf-109f-4'], 'one request for both');
  assert.equal(JSON.parse(await readFile(join(dir, 'bf-109f-4.json'), 'utf8')).name, 'Bf 109 F-4');
  assert.equal((await store.get('bf-109f-4')).name, 'Bf 109 F-4');
  assert.equal(calls.length, 1, 'then from disk');

  assert.equal(await store.get('missing'), null);
  assert.equal(await store.get('missing'), null);
  assert.equal(calls.length, 2, 'a miss waits an hour');
  t += 61 * 60 * 1000;
  await store.get('missing');
  assert.equal(calls.length, 3);

  // A week later the copy is served and read again behind it.
  t += 8 * 24 * 60 * 60 * 1000;
  assert.equal((await store.get('bf-109f-4')).name, 'Bf 109 F-4');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, 4);
  assert.equal(await store.get('../etc'), null);
});
