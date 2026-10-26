import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { planImport, sourceUrl, templateNames } from '../lib/liquipedia/importer.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/liquipedia/${name}`, import.meta.url), 'utf8');
const pages = {
  'Potato Cup/2025/Summer/Prop': fixture('groups-and-playoff.wiki'),
  'Potato Cup/2024/Autumn/Prop/Intermediate Group': fixture('double-elim-8.wiki'),
};
const templates = { 'Bracket/8U4L2DSL1D': fixture('template-8U4L2DSL1D.wiki'), 'Bracket/4': fixture('template-4.wiki') };

test('template names and source links', () => {
  assert.deepEqual(templateNames(pages), ['Bracket/4', 'Bracket/8U4L2DSL1D']);
  assert.equal(sourceUrl('Potato Cup Weekly/13'), 'https://liquipedia.net/warthunder/Potato_Cup_Weekly/13');
});

test('events in date order; case variants map onto existing platform ids', () => {
  const plan = planImport({ pages, templates, existingIds: ['jksockscollect'] });
  assert.deepEqual(plan.events.map((e) => e.date), ['2024-10-06', '2025-06-22']);
  const de = plan.events[0];
  assert.ok(de.players.some((p) => p.id === 'jksockscollect'));
  assert.ok(!de.players.some((p) => p.id === 'JKsocksCollect'));
  assert.ok(de.matches.every((m) => m.winner_id !== 'JKsocksCollect'));
  assert.deepEqual(plan.merged.find((m) => m.into === 'jksockscollect')?.from, ['JKsocksCollect']);
  assert.ok(!plan.newPlayers.includes('jksockscollect'));
  assert.equal(de.sourceUrl, 'https://liquipedia.net/warthunder/Potato_Cup/2024/Autumn/Prop/Intermediate_Group');
});

test('look-alike names (underscores, Cyrillic letters, spaces) become one player', () => {
  const page = (a, b) => `{{Infobox league|name=X|sdate=2025-01-01|edate=2025-01-01}}
{{Bracket|Bracket/4|id=x
|R1M1={{Match|opponent1={{1Opponent|${a}|score=2}}|opponent2={{1Opponent|Zed|score=0}}}}
|R1M2={{Match|opponent1={{1Opponent|${b}|score=2}}|opponent2={{1Opponent|Yan|score=1}}}}
|R2M1={{Match|opponent1={{1Opponent|${a}|score=2}}|opponent2={{1Opponent|${b}|score=0}}}}
}}`;
  const plan = planImport({
    pages: { 'Potato Cup Weekly/1': page('NST', 'ComRad'), 'Potato Cup Weekly/2': page('NST_', 'ComRаd') },
    templates: { 'Bracket/4': fixture('template-4.wiki') },
    existingIds: ['ComRad'],
  });
  const ids = new Set(plan.events.flatMap((e) => e.players.map((p) => p.id)));
  assert.ok(ids.has('ComRad') && !ids.has('ComRаd'));
  assert.equal([...ids].filter((id) => id.startsWith('NST')).length, 1);
  assert.deepEqual(plan.similar, []);
});
