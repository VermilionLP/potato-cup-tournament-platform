import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildTssWikiPage, bracketStructure, cleanTeamName, defaultStandingsBg, exportedMatches,
  goldenEagles, matchIndex, modeOf, parseRanges, placements, tssSummary,
} from '../lib/tss/wiki.js';
import { normalizeTssSettings, defaultTssSettings } from '../lib/tss/settings.js';
import { parseBracketTemplate } from '../lib/liquipedia/bracket-template.js';
import { DOUBLE_ELIM_TEMPLATE_MATCHES } from '../lib/liquipedia/de-templates.js';
import { parseTemplates } from '../lib/liquipedia/wikitext.js';

// Fixtures: real TSS answers, cut down to the fields the export reads. A
// match is [id, typeBracket, idTeamA, realNameA, idTeamB, realNameB, scoreA,
// scoreB, matchResult, winner side]; expand() gives it TSS's shape.
const fixture = (name) => readFileSync(new URL(`./fixtures/tss/${name}`, import.meta.url), 'utf8');
const match = ([id, typeBracket, idTeamA, realNameA, idTeamB, realNameB, scoreA, scoreB, matchResult, side], time) => ({
  id, typeBracket, idTeamA, realNameA, idTeamB, realNameB, scoreA, scoreB, matchResult,
  teamA: `a${id}`, teamB: `b${id}`, winner: side === 1 ? `a${id}` : side === 2 ? `b${id}` : '',
  ...(time ? { timeInvite: Number(time) } : {}),
});
const rounds = (rs) => (rs || []).map((r) => r.map((m) => match(m)));
function load(id) {
  const raw = JSON.parse(fixture(`tss-${id}.json`));
  const data = { id, detail: raw.detail, bracket: null, swiss: [], groups: [], rosters: {}, statGroup: raw.statGroup, mtimes: {} };
  if (raw.bracket) {
    const { winner, loser } = raw.bracket;
    data.bracket = {
      winner: { Winner: rounds(winner.Winner), Final: rounds(winner.Final) },
      loser: { Looser: rounds(loser.Looser), LooserFinal: rounds(loser.LooserFinal), Semifinal: rounds(loser.Semifinal) },
    };
  }
  if (raw.swiss) {
    data.swiss = [{
      GroupStage: raw.swiss.GroupStage,
      GroupMatch: raw.swiss.GroupMatch.map((g) => Object.fromEntries(Object.entries(g).map(([t, ms]) => [t, ms.map((m) => match(m, t))]))),
    }];
  }
  return data;
}
const settings = (over = {}) => normalizeTssSettings({ ...defaultTssSettings(), ...over });

// "|R1M2={{Match ... opponent1={{X|p1=A|score=1}} ..." -> { R1M2: { a, b, sa, sb } }
function slots(text) {
  const out = {};
  for (const m of text.matchAll(/\|(R\d+M\d+|RxMTP)=\{\{Match([\s\S]*?)\n\}\}/g)) {
    const ops = [...m[2].matchAll(/opponent\d=\{\{\w+Opponent\|(?:p1=)?([^|}]*)(?:\|score=(\w*))?/g)];
    out[m[1]] = { a: ops[0][1], b: ops[1][1], sa: ops[0][2] ?? '', sb: ops[1][2] ?? '' };
  }
  return out;
}

test('helpers: team names, Golden Eagles, ranges, mode', () => {
  assert.equal(cleanTeamName('Team[warning]2'), 'Team 2');
  assert.equal(cleanTeamName('PMC_Asbest'), 'PMC Asbest');
  assert.equal(cleanTeamName('__'), '__');
  assert.equal(goldenEagles('50% RP Booster  (Booster), 500  (GE), '), '500');
  assert.equal(goldenEagles('50% SL Booster  (Booster), '), '');
  assert.deepEqual(parseRanges('49-63, 1-8；60-'), [[49, 63], [1, 8], [60, Infinity]]);
  assert.throws(() => parseRanges('abc'), (e) => e.code === 'BAD_RANGE');
  assert.equal(modeOf({ nameEN: 'RBm Tanks1x1', teamSize: '1' }), 'RBm');
  assert.equal(modeOf({ nameEN: 'Jet Duel RB 1x1', teamSize: '1', countryTeamA: 'usa, germany' }), 'RB');
  assert.equal(modeOf({ nameEN: 'Open Qualifier', teamSize: '4', gameMode: 'RB', countryTeamA: 'usa, germany' }), 'RBm');
  assert.equal(defaultStandingsBg(10), '1=up, 2-3=stayup, 4-7=stay, 8-10=down');
  assert.equal(defaultStandingsBg(6), '1=up, 2-3=stayup, 4-6=stay');
});

test('settings: anything in, a complete bounded object out; a new event takes over the last one of its kind', () => {
  const s = normalizeTssSettings({ opponent: 'x', qualifiers: 999, startRound: '2', filter: { by: 'id', ranges: '1-2' }, sections: { maps: false } });
  assert.equal(s.opponent, 'auto');
  assert.equal(s.qualifiers, 0);
  assert.equal(s.startRound, 2); // form values may arrive as strings
  assert.deepEqual(s.filter, { by: 'id', ranges: '1-2' });
  assert.equal(s.sections.maps, false);
  assert.equal(s.sections.prize, true);
  const next = defaultTssSettings({ title: 'Week 48', series: 'Jet Duel RB 1x1', tier: '5', tiertype: 'Weekly', startRound: 2 });
  assert.equal(next.series, 'Jet Duel RB 1x1');
  assert.equal(next.tier, '5');
  assert.equal(next.title, '');
  assert.equal(next.startRound, 0);
});

test('1v1 single elimination: the layout of Jet_Duel_RB/1x1/2025/Weekly/48 (TSS 23359)', () => {
  const data = load(23359);
  const { text, warnings } = buildTssWikiPage(data, settings({ startRound: 2, title: 'Jet Duel RB 1x1 - 2025 Week 48', tier: '5', tiertype: 'Weekly' }));
  assert.match(text, /\|name=Jet Duel RB 1x1 - 2025 Week 48\n/);
  assert.match(text, /\|series=Jet Duel RB 1x1\n/);
  assert.match(text, /\|server=Europe\n\|type=Online\n\|format=1v1\n\|mode=RB\n\|vehicle=Aviation\n\|date=2025-11-26\n\|liquipediatier=5 \|liquipediatiertype=Weekly\n/);
  assert.match(text, /==Format==\n\* Single-elimination Bracket:\n\* All matches are Bo1\./);
  // Places with Golden Eagles get freetext1; 9-16 have boosters only.
  assert.ok(text.includes([
    '{{SoloPrizePool|freetext1=Golden Eagle',
    '|{{Slot|place=1|freetext1=500}}',
    '|{{Slot|place=2|freetext1=400}}',
    '|{{Slot|place=3-4|freetext1=200}}',
    '|{{Slot|place=5-8|freetext1=100}}',
    '|{{Slot|place=9-16}}',
    '}}',
  ].join('\n')));
  assert.ok(text.includes('{{ParticipantTable|count=1|hidden=1\n|p1=Ανι Ρhysιcα\n|p2=Олег вазелин\n|p3=Ilyxa_keno4ka\n|p4=RNGеsus\n|p5=SlytHer\n|p6=SaLoMa\n|p7=Чебурашка\n|p8=AgentSeagle\n}}'));
  assert.match(text, /==Results==\n\{\{Bracket\|Bracket\/8\|id=\w{10}\|finish=true\n/);
  assert.match(text, /\|date=2025-11-26\n/);

  // Slot by slot against the wiki page. Known differences come from TSS:
  // the player has been renamed since (микрофеникс -> Олег вазелин), TSS
  // has no winner for R1M2, and puts another player in R2M1.
  const ours = slots(text);
  const wiki = slots(fixture('jet-duel-23359.wiki'));
  assert.deepEqual(Object.keys(ours).sort(), Object.keys(wiki).sort());
  const renamed = (s) => s.replace('Олег вазелин', 'микрофеникс');
  for (const key of Object.keys(wiki)) {
    const o = ours[key];
    const w = wiki[key];
    if (key === 'R1M2') {
      assert.deepEqual([o.a, o.b, o.sa, o.sb], ['Ilyxa_keno4ka', 'RNGеsus', '0', '0']);
      continue;
    }
    if (key === 'R2M1') {
      assert.deepEqual([renamed(o.a), o.sa, o.sb], [w.a, 'W', 'FF']);
      continue;
    }
    assert.deepEqual({ ...o, a: renamed(o.a), b: renamed(o.b) }, w, key);
  }
  assert.ok(warnings.some((w) => w.includes('第 2 轮')));
  assert.ok(warnings.some((w) => w.includes('没有胜者')));
});

test('match numbers and a range: #9-15 of a 16 bracket is the bracket of 8', () => {
  const data = load(23359);
  const index = matchIndex(data, settings());
  assert.equal(index.length, 15);
  assert.deepEqual(index.slice(8, 9).map((r) => [r.seq, r.id, r.stage.round]), [[9, '824708', 2]]);
  const ranged = buildTssWikiPage(data, settings({ filter: { by: 'seq', ranges: '9-15' } })).text;
  assert.match(ranged, /\{\{Bracket\|Bracket\/8\|/);
  const byId = buildTssWikiPage(data, settings({ filter: { by: 'id', ranges: '824712-824714' } }));
  assert.match(byId.text, /\{\{Bracket\|Bracket\/4\|/);
  assert.equal(exportedMatches(data, settings({ startRound: 2 })).length, 7);
  const summary = tssSummary(data);
  assert.equal(summary.solo, true);
  assert.equal(summary.type, 'single');
  assert.deepEqual(summary.upper_rounds.map((r) => r.teams), [16, 8, 4, 2]);
  // Weekly cups share one name: the default title carries the start date.
  assert.ok(summary.start);
  assert.equal(summary.title, `${summary.name} ${summary.start}`);
  assert.match(buildTssWikiPage(data, settings()).text, new RegExp(`\\{\\{DISPLAYTITLE:${summary.name} ${summary.start}\\}\\}`));
  assert.match(buildTssWikiPage(data, settings({ title: 'My Cup #5' })).text, /\{\{DISPLAYTITLE:My Cup #5\}\}/, 'a title set is kept as it is');
});

test('team double elimination: slots follow the commons template 8U4L2DSL1D (TSS 26300)', () => {
  const data = load(26300);
  const { text } = buildTssWikiPage(data, settings({ rosters: false }));
  assert.match(text, /\{\{Bracket\|Bracket\/8U4L2DSL1D\|id=\w{10}\n/);
  assert.match(text, /\|mode=RBm\n\|vehicle=Ground\n/);
  assert.match(text, /\* {2}Double Elimination Bracket\n\*\* All stages are \{\{Abbr\/Bo5\}\}\.\n\*\* Tank RBm\n\*\* 4v4\n\*\* 4 Spawns/);
  const ours = slots(text);
  const template = parseBracketTemplate(DOUBLE_ELIM_TEMPLATE_MATCHES['8U4L2DSL1D'].split(' ').map((p) => `{{TemplateMatch|${p}}}`).join('')).matches;
  const expected = [...template.keys()].filter((k) => k !== 'RxMBR').sort();
  assert.deepEqual(Object.keys(ours).sort(), expected);
  // Each slot's feeders (toupper / tolower) are matches whose winners play in it.
  const winnerOf = (s) => (Number(s.sa) > Number(s.sb) ? s.a : s.b);
  for (const node of template.values()) {
    if (!ours[node.key]) continue;
    for (const feeder of [node.upper, node.lower].filter(Boolean)) {
      const w = winnerOf(ours[feeder]);
      assert.ok([ours[node.key].a, ours[node.key].b].includes(w), `${feeder} -> ${node.key}`);
    }
  }
  assert.deepEqual(ours.R5M1, { a: 'JinX', b: 'AVReS', sa: '3', sb: '0' });
  assert.match(text, /\|R5M1=\{\{Match\n {4}\|bestof=5\n {4}\|date=2026-11-08 19:35 \{\{abbr\/UTC\}\}\n {4}\|finished=true\n {4}\|winner=1\n/);
  // Places by elimination stage; no Golden Eagles here, so no freetext.
  assert.deepEqual(placements(data).map((p) => p.place), ['1', '2', '3', '4', '5-6', '7-8']);
  assert.ok(text.includes('{{TeamPrizePool|prizesummary=0|cutafter=8\n|{{Slot|place=1|{{Opponent|JinX}}}}\n|{{Slot|place=2|{{Opponent|AVReS}}}}\n|{{Slot|place=3|{{Opponent|VOYAGER}}}}\n|{{Slot|place=4|{{Opponent|DODEC}}}}\n}}'));
  assert.match(text, /\{\{MapPoolTable\n\|size=x150px\n\|map1=Advance to the Rhine\|map1displayName=\n\|map2=Normandy/);
  assert.match(text, /\{\{TeamParticipants\n\|\{\{Opponent\|JinX\n {2}\|players=\{\{Persons\n {4}\|\{\{Person\|wt_tournament_89\|flag=\|role=Captain\}\}/);
});

test('double elimination from a later round drops the matching lower rounds; match times win over round times', () => {
  const data = load(26300);
  data.mtimes = { 930845: '1794167000' };
  const { text } = buildTssWikiPage(data, settings({ startRound: 2, sections: { results: true } }));
  assert.match(text, /\{\{Bracket\|Bracket\/4U2L1D\|/);
  const ours = slots(text);
  assert.deepEqual(Object.keys(ours).sort(), ['R1M1', 'R1M2', 'R1M3', 'R2M1', 'R2M2', 'R3M1']);
  assert.deepEqual(ours.R1M3, { a: 'AVReS', b: 'DODEC', sa: '3', sb: '1' }); // the lower semifinal
  assert.match(text, /\|R3M1=\{\{Match\n {4}\|bestof=5\n {4}\|date=2026-11-08 19:43 \{\{abbr\/UTC\}\}/);
  assert.equal(bracketStructure(data).all.length, 14);
});

test('Swiss: GroupStandings and the matchlists of TSS/Season_2026/The_Dino_Labs/4v4_RB (TSS 24850)', () => {
  const data = load(24850);
  const { text } = buildTssWikiPage(data, settings());
  assert.ok(text.includes([
    '==Result==',
    '{{GroupStandings',
    '|title=Standings',
    '|bg=1=up, 2-3=stayup, 4-7=stay, 8-10=down',
    '|tiebreakers={{Json|points|buchholz|gamediff}}',
    '|round1={{Round|title=Round 1|matchgroups=tss24850r1}}',
  ].join('\n')));
  assert.ok(text.includes('|round6={{Round|title=Round 6|matchgroups=tss24850r6}}\n}}\n{{Box|break|padding=1em}}'));
  assert.ok(!text.includes('Round 7'), 'empty TSS rounds are left out');
  // From the first round on, the page as it is on the wiki, apart from the
  // teams the editor renamed by hand.
  const renamed = { __: 'Team J', ENEMY: 'LEGION', qqqqqq: 'Hide', AstDust: 'Amiti', u3u: 'LEET', Funi: 'Abstract' };
  let ours = text.slice(text.indexOf('==={{HiddenSort|Round 1}}==='), text.indexOf('{{Box|end}}') + '{{Box|end}}'.length);
  for (const [from, to] of Object.entries(renamed)) ours = ours.replaceAll(`{{TeamOpponent|${from}|`, `{{TeamOpponent|${to}|`);
  const wiki = fixture('dino-labs-24850.wiki');
  assert.equal(ours, wiki.slice(wiki.indexOf('==={{HiddenSort|Round 1}}==='), wiki.indexOf('{{Box|end}}') + '{{Box|end}}'.length));
  const tpl = parseTemplates(text).find((t) => t.name === 'GroupStandings');
  assert.ok(tpl, 'GroupStandings parses');
});

test('no bracket yet: the page says so instead of failing', () => {
  const data = load(23359);
  data.bracket = null;
  data.detail = { ...data.detail, tournamentStatus: 'open' };
  const { text, warnings } = buildTssWikiPage(data, settings());
  assert.ok(!text.includes('{{Bracket'));
  assert.ok(warnings.some((w) => w.includes('还没有生成对阵')));
  // Prize places from the stage numbers alone.
  assert.ok(text.includes('|{{Slot|place=3-4|freetext1=200}}\n|{{Slot|place=5-8|freetext1=100}}\n|{{Slot|place=9-16}}\n|{{Slot|place=17-32}}'));
});
