import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseTemplates, resolveMagic, stripComments } from '../lib/liquipedia/wikitext.js';
import { matchResult, parseBlocks, parseInfobox, parseOpponent } from '../lib/liquipedia/page.js';
import { isDoubleElimination, pageKey, parseBracketTemplate } from '../lib/liquipedia/bracket-template.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/liquipedia/${name}`, import.meta.url), 'utf8');

test('templates: nesting, named and positional params, links and comments', () => {
  const [t] = parseTemplates('{{Match|opponent1={{1Opponent|A [[x|y]]|score=2}}|bestof=3|plain}}');
  assert.equal(t.name, 'Match');
  assert.equal(t.params.opponent1, '{{1Opponent|A [[x|y]]|score=2}}');
  assert.equal(t.params.bestof, '3');
  assert.equal(t.params['1'], 'plain');
  assert.equal(parseTemplates('{{bracket|Bracket/8|id=x}}')[0].name, 'Bracket');
  assert.equal(stripComments('a<!-- b -->c<!-- open'), 'ac');
  assert.equal(resolveMagic('Weekly #{{SUBPAGENAME}}{{!}}x', 'Potato Cup Weekly/37'), 'Weekly #37|x');
});

test('opponents and results: scores, walkovers in any case, byes, teams', () => {
  assert.deepEqual(parseOpponent('{{SoloOpponent|p1=Neon_Uni|flag=uk|score=2}}'), { name: 'Neon_Uni', flag: 'uk', score: '2' });
  assert.equal(parseOpponent('{{1Opponent|TBD}}').name, null);
  assert.deepEqual(parseOpponent('{{2Opponent|p1=a|p2=b}}'), { team: true });
  const res = (o1, o2, extra = '') => matchResult(parseBlocks(
    `{{Bracket|Bracket/2|R1M1={{Match${extra}|opponent1=${o1}|opponent2=${o2}}}}}`,
  )[0].matches.R1M1);
  assert.deepEqual(
    (({ kind, s1, s2, winner }) => ({ kind, s1, s2, winner }))(res('{{1Opponent|a|score=3}}', '{{1Opponent|b|score=1}}')),
    { kind: 'played', s1: 3, s2: 1, winner: 1 },
  );
  assert.equal(res('{{1Opponent|a|score=ff}}', '{{1Opponent|b|score=w}}').winner, 2);
  assert.equal(res('{{1Opponent|a|score=W}}', '{{1Opponent|b|score=FF}}').kind, 'walkover');
  assert.equal(res('{{1Opponent|a}}', '{{1Opponent|b}}', '|walkover=2').winner, 2);
  assert.equal(res('{{1Opponent|a}}', '{{1Opponent|TBD}}').kind, 'bye');
  assert.equal(res('{{1Opponent|a}}', '{{1Opponent|b}}').kind, 'unplayed');
  assert.deepEqual(
    (({ s1, s2, winner }) => ({ s1, s2, winner }))(res('{{1Opponent|a}}', '{{1Opponent|b}}', '|map1={{Map|winner=2}}|map2={{Map|winner=2}}')),
    { s1: 0, s2: 2, winner: 2 },
  );
});

test('infobox: magic words and end date', () => {
  const info = parseInfobox(fixture('weekly-37.wiki'), 'Potato Cup Weekly/37');
  assert.equal(info.name, 'FamilyX Potato Cup Weekly #37');
  assert.equal(info.date, '2026-10-17');
  assert.equal(info.mode, 'RB');
  const dbl = parseInfobox(fixture('double-elim-8.wiki'), 'Potato Cup/2024/Autumn/Prop/Intermediate Group');
  assert.equal(dbl.date, '2024-10-06', 'edate wins');
});

test('blocks: bracket matches, swiss matchlists, groups', () => {
  const [bracket] = parseBlocks(fixture('weekly-37.wiki'));
  assert.equal(bracket.template, 'Bracket/4L2DH8LS');
  assert.equal(Object.keys(bracket.matches).length, 13);
  assert.equal(matchResult(bracket.matches.R4M1).s1, 4);

  const swiss = parseBlocks(fixture('swiss-weekly-13.wiki'));
  assert.deepEqual(swiss.map((b) => b.kind), ['swisstable', 'matchlist', 'matchlist']);
  assert.equal(swiss[1].title, 'Round 1');
  assert.equal(swiss[2].matches[1].match.opponent1.score, 'FF');

  const groups = parseBlocks(fixture('groups-and-playoff.wiki'));
  assert.deepEqual(groups.map((b) => b.kind), ['group', 'matchlist', 'group', 'matchlist', 'bracket']);
  assert.deepEqual(groups[0].players, ['RussianShark_', 'ds74m', '拿拿酱', 'FunTheMental']);
  assert.equal(groups[1].matches[2].header, 'Round 2');
});

test('bracket templates: feeders, sides, reset and third place', () => {
  assert.equal(pageKey('R01-M005'), 'R1M5');
  const dbl = parseBracketTemplate(fixture('template-8U4L2DSL1D.wiki'));
  assert.ok(isDoubleElimination(dbl));
  const n = (k) => dbl.matches.get(k);
  assert.deepEqual([n('R5M1').upper, n('R5M1').lower, n('R5M1').reset], ['R4M1', 'R4M2', 'RxMBR']);
  assert.deepEqual(['R1M1', 'R1M4', 'R1M5', 'R1M6', 'R2M3', 'R4M1', 'R4M2'].map((k) => n(k).side), ['u', 'u', 'l', 'l', 'l', 'u', 'l']);
  assert.equal(n('R2M3').upper, null, 'upper slot filled by a winners-bracket loser');
  assert.deepEqual(n('R2M3').parent, { key: 'R3M1', slot: 1 });

  const single = parseBracketTemplate(fixture('template-4L2DH4LS.wiki'));
  assert.equal(isDoubleElimination(single), false);
  assert.equal(single.matches.get('R4M1').thirdPlace, 'RxMTP');
  assert.equal(single.matches.get('RxMTP').side, 'tp');
  assert.deepEqual(single.matches.get('R1M1').parent, { key: 'R2M1', slot: 2 });
});
