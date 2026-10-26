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
