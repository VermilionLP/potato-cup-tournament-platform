import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectVehiclePool, formatSection } from '../lib/liquipedia/vehicle-pool.js';

const page = (format, rest = '') => `{{Infobox league\n|name=X\n}}\n==Format==\n${format}\n==Participants==\n${rest}`;

test('the Format section line-up comes first', () => {
  const pool = (format, extra = {}) => detectVehiclePool({ title: 'Potato Cup Weekly/30', wikitext: page(format), date: '2026-08-01', ...extra });
  assert.equal(pool('* Single-elimination Bracket:\n* Legacy Jet Line-up'), 'legacy-jet');
  assert.equal(pool('* Prop Line-up'), 'prop');
  assert.equal(pool('* Pro League Line-up'), 'proleague');
  assert.equal(pool('* ProLeague Line-up'), 'proleague');
  assert.equal(pool('* Top Jet Line-up'), 'legacy-jet');
  assert.equal(pool("* Prop League Line-up\n* '''Group Stage:'''"), 'proleague', 'BVR page typo');
  // A line-up mentioned in another section does not count.
  assert.equal(detectVehiclePool({ title: 'Potato Cup Weekly/12', wikitext: page('* All matches are Bo5.', '* Legacy Jet Line-up'), date: '2025-05-04' }), 'prop');
});

test('then the event name; Jet before 2026 is a jet event (Top Jet before Weekly #23); otherwise Prop', () => {
  assert.equal(detectVehiclePool({ title: 'Potato Cup/2024/Autumn/Jet/Beginners Group', date: '2024-09-20' }), 'top-jet');
  assert.equal(detectVehiclePool({ title: 'Potato Cup/2025/Winter/Jet', date: '2025-12-27' }), 'top-jet');
  assert.equal(detectVehiclePool({ title: 'Potato Cup/2025/Winter/Jet' }), 'legacy-jet', 'no date: Legacy Jet');
  assert.equal(detectVehiclePool({ title: 'Potato Cup/2025/Spring/Prop/Qualifier/Asia', date: '2025-02-21' }), 'prop');
  assert.equal(detectVehiclePool({ title: 'Potato Cup/2026/Winter/Legacy Jet', date: '2027-02-20' }), 'legacy-jet');
  assert.equal(detectVehiclePool({ title: 'Potato Cup/2024/Lunar New Year Cup', date: '2024-02-10' }), 'prop');
  assert.equal(detectVehiclePool({ title: 'Potato Cup/2023/Spring', date: '2023-04-28' }), 'prop');
  assert.equal(detectVehiclePool({ title: 'Potato Cup Weekly/13', wikitext: page('* All matches are Bo5.'), date: '2025-08-15' }), 'prop');
});

test('organiser exceptions', () => {
  assert.equal(detectVehiclePool({ title: 'Potato Cup Weekly/14', date: '2025-08-22' }), 'top-jet');
  assert.equal(detectVehiclePool({ title: 'Potato Cup Weekly/16', date: '2025-11-15' }), 'top-jet');
  const topJet = page('* Single-elimination Bracket:\n* Top Jet Line-up');
  const legacyJet = page('* Single-elimination Bracket:\n* Legacy Jet Line-up');
  assert.equal(detectVehiclePool({ title: 'Potato Cup Weekly/19', wikitext: topJet, date: '2026-05-04' }), 'top-jet');
  assert.equal(detectVehiclePool({ title: 'Potato Cup Weekly/20', wikitext: topJet, date: '2026-05-10' }), 'top-jet');
  // From Weekly #23 on, jet events are Legacy Jet, whatever the page calls the line-up.
  assert.equal(detectVehiclePool({ title: 'Potato Cup Weekly/23', wikitext: legacyJet, date: '2026-05-30' }), 'legacy-jet');
  assert.equal(detectVehiclePool({ title: 'Potato Cup Weekly/25', wikitext: topJet, date: '2026-06-27' }), 'legacy-jet');
  assert.equal(detectVehiclePool({ title: 'Potato Cup Weekly/1', date: '2023-10-21' }), 'prop', 'not Weekly/14 by prefix');
  assert.equal(detectVehiclePool({ title: 'Potato Cup/2026/June/Europe', date: '2026-06-13' }), 'prop');
  assert.equal(detectVehiclePool({ title: 'Potato Cup/2026/Aug/Asia Pacific', date: '2026-08-15' }), 'legacy-jet');
});

test('format section', () => {
  assert.equal(formatSection(page('* a\n* b')).trim(), '* a\n* b');
  assert.equal(formatSection('no format'), '');
  assert.equal(formatSection('==Format===\n* x\n===Sub===\n* y\n==Next==\n* z').includes('* y'), true);
});
