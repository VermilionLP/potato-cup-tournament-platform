import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCountry } from '../lib/liquipedia/countries.js';
import { collectNationalities, namesOnPages, planFlagUpdates, playerPageCountry } from '../lib/liquipedia/nationality.js';

test('country values: codes, names, three-letter codes, unknown', () => {
  assert.equal(normalizeCountry('RU'), 'ru');
  assert.equal(normalizeCountry('Great Britain'), 'gb');
  assert.equal(normalizeCountry('Wales'), 'gb');
  assert.equal(normalizeCountry('UKR'), 'ua');
  assert.equal(normalizeCountry('America'), 'us');
  assert.equal(normalizeCountry('\tChina\t'), 'cn');
  assert.equal(normalizeCountry('xx'), null);
  assert.equal(normalizeCountry('Atlantis'), null);
});

test('player page country', () => {
  assert.equal(playerPageCountry('{{Infobox player\n|id=Willie_Walrus\n|country=Wales\n|team=EXOTIC\n}}'), 'gb');
  assert.equal(playerPageCountry('no infobox'), null);
});

const older = `{{Infobox league|name=A|sdate=2024-01-01|edate=2024-01-01}}
{{ParticipantTable|count=1
|{{ParticipantSection|title=[[X|Advanced Group]]
|p1=\tIrB1S\t|p1flag=\tRussia
|p2=\tv1nnу\t|p2flag=\tUkraine
|p3=Nobody|p3flag=xx
}}}}`;
const newer = `{{Infobox league|name=B|sdate=2025-01-01|edate=2025-01-01}}
{{Bracket|Bracket/2|id=y
|R1M1={{Match|opponent1={{1Opponent|IrB1S|flag=kz|score=2}}|opponent2={{1Opponent|Solo|score=0}}}}
}}`;

test('latest tournament page wins, player page beats both, names match like the import', () => {
  const pages = { 'Potato Cup/B': newer, 'Potato Cup/A': older };
  assert.deepEqual(namesOnPages(pages).sort(), ['IrB1S', 'Nobody', 'Solo', 'v1nnу']);
  let nat = collectNationalities({ pages });
  const irbis = [...nat.values()].find((v) => v.from === 'IrB1S');
  assert.equal(irbis.flag, 'kz');
  assert.deepEqual(irbis.conflicts, ['ru']);
  nat = collectNationalities({ pages, playerPages: { IrB1S: '{{Infobox player|country=Russia}}' } });
  assert.equal([...nat.values()].find((v) => v.from === 'IrB1S').source, 'player page');

  const plan = planFlagUpdates({
    nationalities: nat,
    players: [
      { id: 'irb1s', flag: '', imported: true },          // empty -> filled
      { id: 'V1nny', flag: 'cn', imported: true },         // imported only -> replaced (Cyrillic у matched)
      { id: 'Solo', flag: '', imported: true },            // no flag anywhere -> missing
      { id: 'Nobody', flag: 'de', imported: false },       // 'xx' gives nothing; keeps de
    ],
  });
  assert.deepEqual(plan.updates.map((u) => [u.id, u.to]), [['irb1s', 'ru'], ['V1nny', 'ua']]);
  assert.deepEqual(plan.missing, ['Solo']);
  assert.deepEqual(plan.conflicts, []);
});

test('platform players keep their own flag unless --overwrite', () => {
  const nationalities = collectNationalities({ pages: { 'Potato Cup/A': older } });
  const players = [{ id: 'IrB1S', flag: 'cn', imported: false }];
  assert.deepEqual(planFlagUpdates({ players, nationalities }).conflicts.map((c) => [c.from, c.to]), [['cn', 'ru']]);
  assert.equal(planFlagUpdates({ players, nationalities, overwrite: true }).updates.length, 1);
});
