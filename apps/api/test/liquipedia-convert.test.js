import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseBracketTemplate } from '../lib/liquipedia/bracket-template.js';
import { convertPage, isLoserAdvances, normalizeFlag, slugify } from '../lib/liquipedia/convert.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/liquipedia/${name}`, import.meta.url), 'utf8');
const templates = new Map([
  ['Bracket/8U4L2DSL1D', parseBracketTemplate(fixture('template-8U4L2DSL1D.wiki'))],
  ['Bracket/4L2DH4LS', parseBracketTemplate(fixture('template-4L2DH4LS.wiki'))],
  ['Bracket/4', parseBracketTemplate(fixture('template-4.wiki'))],
]);
const byKey = (event) => new Map(event.matches.map((m) => [m.key, m]));

test('helpers', () => {
  assert.equal(normalizeFlag('uk'), 'gb');
  assert.equal(normalizeFlag('Spain'), 'es');
  assert.equal(normalizeFlag('CN'), 'cn');
  assert.equal(normalizeFlag(''), null);
  assert.equal(slugify('Potato Cup/2024/Autumn/Prop/Intermediate Group'), 'potato-cup-2024-autumn-prop-intermediate-group');
});

test('double elimination: brackets, rounds, winner links and inferred drops', () => {
  const out = convertPage({ title: 'Potato Cup/2024/Autumn/Prop/Intermediate Group', wikitext: fixture('double-elim-8.wiki'), templates });
  assert.equal(out.skipped, null);
  assert.deepEqual(out.warnings, []);
  const [e] = out.events;
  assert.equal(e.id, 'lp-pc-2024-autumn-prop-intermediate-group');
  assert.equal(e.format, 'double_elim');
  assert.equal(e.date, '2024-10-06');
  assert.equal(e.players.length, 8);
  const m = byKey(e);
  assert.deepEqual([m.get('R1M1').bracket, m.get('R1M1').round], ['wb', 3]);
  assert.deepEqual([m.get('R4M1').bracket, m.get('R4M1').round], ['wb', 1]);
  assert.deepEqual([m.get('R1M5').bracket, m.get('R1M5').round], ['lb', 4]);
  assert.deepEqual([m.get('R4M2').bracket, m.get('R4M2').round], ['lb', 1]);
  assert.deepEqual([m.get('R5M1').bracket, m.get('R5M1').winner_id], ['gf', 'JKsocksCollect']);
  // Winner links from the template.
  assert.deepEqual([m.get('R1M1').next_key, m.get('R1M1').next_slot], ['R2M1', 1]);
  assert.deepEqual([m.get('R4M2').next_key, m.get('R4M2').next_slot], ['R5M1', 2]);
  // Drops found from the results.
  assert.deepEqual([m.get('R1M1').loser_next_key, m.get('R1M1').loser_next_slot], ['R1M5', 1]);
  assert.deepEqual([m.get('R1M4').loser_next_key, m.get('R1M4').loser_next_slot], ['R1M6', 2]);
  assert.deepEqual([m.get('R2M2').loser_next_key, m.get('R2M2').loser_next_slot], ['R2M3', 1]);
  assert.deepEqual([m.get('R4M1').loser_next_key, m.get('R4M1').loser_next_slot], ['R4M2', 1]);
  // Walkovers.
  assert.deepEqual([m.get('R1M1').status, m.get('R1M1').winner_id], ['walkover', 'Vascobas']);
  // Positions unique per (bracket, round).
  const keys = e.matches.map((r) => `${r.bracket}:${r.round}:${r.position}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('irregular single elimination becomes a full tree with bye chains', () => {
  const players = Array.from({ length: 10 }, (_, i) => `P${i + 1}`);
  const mk = (a, b, s1, s2) => `{{Match|opponent1={{1Opponent|${a}|score=${s1}}}|opponent2={{1Opponent|${b}|score=${s2}}}}}`;
  const wiki = `{{Infobox league|name=Test #{{SUBPAGENAME}}|date=2025-01-01}}
{{Bracket|Bracket/4L2DH4LS|id=x
|R1M1=${mk('P9', 'P10', 2, 0)}
|R1M2=${mk('P7', 'P8', 0, 2)}
|R2M1=${mk('P1', 'P9', 2, 0)}
|R2M2=${mk('P2', 'P3', 2, 1)}
|R2M3=${mk('P4', 'P8', 2, 1)}
|R2M4=${mk('P5', 'P6', 0, 2)}
|R3M1=${mk('P1', 'P2', 2, 0)}
|R3M2=${mk('P4', 'P6', 1, 2)}
|R4M1=${mk('P1', 'P6', 3, 1)}
|RxMTP=${mk('P2', 'P4', 2, 0)}
}}`;
  const [e] = convertPage({ title: 'Potato Cup Weekly/99', wikitext: wiki, templates }).events;
  assert.equal(e.name, 'Test #99');
  assert.equal(e.format, 'single_elim');
  assert.equal(e.holdThirdPlace, true);
  const m = byKey(e);
  assert.deepEqual([m.get('R4M1').round, m.get('R4M1').position], [1, 1]);
  assert.deepEqual([m.get('R2M1').round, m.get('R2M1').position], [3, 1]);
  assert.deepEqual([m.get('R1M1').round, m.get('R1M1').position], [4, 2], 'feeds the lower slot of R2M1');
  assert.deepEqual([m.get('RxMTP').round, m.get('RxMTP').position], [0, 1]);
  // P1 enters R2M1 directly: a bye at round 4 position 1.
  const byes = e.matches.filter((r) => !r.player2_id);
  assert.deepEqual(byes.map((r) => [r.player1_id, r.round, r.position]).sort(), [
    ['P1', 4, 1], ['P2', 4, 3], ['P3', 4, 4], ['P4', 4, 5], ['P5', 4, 7], ['P6', 4, 8],
  ]);
  const keys = e.matches.map((r) => `${r.round}:${r.position}`);
  assert.equal(new Set(keys).size, keys.length, 'no position collisions');
  assert.equal(e.players.length, 10);
});

test('groups plus a bracket become one two-stage tournament', () => {
  const out = convertPage({ title: 'Potato Cup/2025/Summer/Prop', wikitext: fixture('groups-and-playoff.wiki'), templates });
  assert.equal(out.events.length, 1);
  const [e] = out.events;
  assert.equal(e.format, 'swiss');
  assert.equal(e.playoffFormat, 'single_elim');
  assert.equal(e.currentStage, 'playoff');
  assert.equal(e.swissRounds, 2);
  assert.equal(e.swissGroupSize, 4);
  assert.equal(e.advancePerGroup, 2);
  const sw = e.matches.filter((r) => r.bracket === 'sw');
  assert.deepEqual([...new Set(sw.map((r) => r.swiss_group))], [1, 2]);
  // Group B has no round labels: rounds come from repeated players.
  assert.deepEqual(sw.filter((r) => r.swiss_group === 2).map((r) => r.round), [1, 1, 2, 2]);
  const positions = sw.map((r) => `${r.round}:${r.position}`);
  assert.equal(new Set(positions).size, positions.length);
  assert.equal(e.players.find((p) => p.id === 'Alpha').swiss_group, 2);
  assert.deepEqual(e.matches.filter((r) => r.bracket === 'main').map((r) => r.round).sort(), [1, 2, 2]);
});

test('swiss pages and skipped pages', () => {
  const swiss = convertPage({ title: 'Potato Cup Weekly/13', wikitext: fixture('swiss-weekly-13.wiki'), templates });
  const [e] = swiss.events;
  assert.equal(e.format, 'swiss');
  assert.equal(e.playoffFormat, null);
  assert.equal(e.swissRounds, 2);
  assert.equal(e.matches.find((r) => r.round === 2 && r.position === 2).status, 'walkover');
  assert.equal(convertPage({ title: 'Potato Cup', wikitext: '{{Infobox series|name=x}}', templates }).skipped, '没有赛事信息框');
  assert.match(convertPage({ title: 'Potato Cup/2024/Spring', wikitext: '{{Infobox league|name=x}}', templates }).skipped, /总览页/);
  assert.ok(convertPage({ title: 'Potato Cup/Leaderboard/2026', wikitext: '{{Infobox league|name=x}}', templates }).skipped);
  const missing = convertPage({ title: 'Potato Cup Weekly/37', wikitext: fixture('weekly-37.wiki'), templates });
  assert.match(missing.warnings[0], /缺少对阵模板 Bracket\/4L2DH8LS/);
});

test('opponents listed in the wrong slot are put where their feeder sends them', () => {
  // Swap the two players of the lower-bracket match R2M3 (feeder R1M5 fills slot 2).
  const wiki = fixture('double-elim-8.wiki').replace(
    '|R2M3={{Match|date=2024-10-05\n    |opponent1={{1Opponent|Leinadmix9_ツ|score=3}}\n    |opponent2={{1Opponent|Galochka_Dell|score=0}}',
    '|R2M3={{Match|date=2024-10-05\n    |opponent1={{1Opponent|Galochka_Dell|score=0}}\n    |opponent2={{1Opponent|Leinadmix9_ツ|score=3}}',
  );
  const out = convertPage({ title: 'X/Y', wikitext: wiki, templates });
  assert.deepEqual(out.warnings, []);
  const r = byKey(out.events[0]).get('R2M3');
  assert.deepEqual([r.player1_id, r.player2_id, r.score1, r.score2, r.winner_id], ['Leinadmix9_ツ', 'Galochka_Dell', 3, 0, 'Leinadmix9_ツ']);
  assert.equal(byKey(out.events[0]).get('R2M2').loser_next_key, 'R2M3');
});

test('inconsistent pages are reported', () => {
  const wiki = fixture('double-elim-8.wiki').replace(
    '|R2M1={{Match|date=2024-10-05\n    |opponent1={{1Opponent|Vascobas|score=2}}',
    '|R2M1={{Match|date=2024-10-05\n    |opponent1={{1Opponent|Atreída|score=2}}',
  );
  const { warnings } = convertPage({ title: 'X/Y', wikitext: wiki, templates });
  assert.ok(warnings.some((w) => /R2M1：上一场 R1M1 的胜者 Vascobas 没有出现在这一场/.test(w)), warnings.join('\n'));
});

test('future and unplayed events are skipped', async () => {
  const { similarNames, nameKey } = await import('../lib/liquipedia/convert.js');
  const future = fixture('double-elim-8.wiki').replace('|sdate=2024-09-20', '|sdate=2099-01-01');
  assert.match(convertPage({ title: 'X/Y', wikitext: future, templates }).skipped, /尚未开始/);
  const empty = '{{Infobox league|name=x|date=2024-01-01}}{{Bracket|Bracket/4|R1M1={{Match|opponent1={{1Opponent|TBD}}|opponent2={{1Opponent|TBD}}}}}}';
  assert.equal(convertPage({ title: 'X/Y', wikitext: empty, templates }).skipped, '没有打完的比赛');
  assert.equal(nameKey('Vitalij_Bеast'), nameKey('Vitalij_Beast'));
  assert.deepEqual(similarNames(['RussianShark', 'RussianShark_', 'Neon_Uni', 'neon uni', 'Solo']), [['RussianShark', 'RussianShark_'], ['Neon_Uni', 'neon uni']]);
});

test('group brackets (2023 Spring): one two-stage event, double-elimination groups + playoff', async () => {
  const { groupBracketPlacings } = await import('../lib/group-brackets.js');
  const t = new Map([
    ['Bracket/2L1D-1Q-U-2-1Q', parseBracketTemplate(fixture('template-2L1D-1Q-U-2-1Q.wiki'))],
    ['Bracket/16U8L4DSL2DSL1D', parseBracketTemplate(fixture('template-16U8L4DSL2DSL1D.wiki'))],
  ]);
  const out = convertPage({ title: 'Potato Cup/2023/Spring', wikitext: fixture('groups-bracket-2023-spring.wiki'), templates: t });
  assert.equal(out.skipped, null);
  assert.equal(out.events.length, 1, 'groups are not separate events');
  const [e] = out.events;
  assert.equal(e.id, 'lp-pc-2023-spring');
  assert.deepEqual([e.format, e.playoffFormat, e.advancePerGroup, e.swissGroupSize, e.currentStage], ['double_elim', 'double_elim', 2, 3, 'playoff']);
  const groupRows = e.matches.filter((m) => ['gwb', 'glb'].includes(m.bracket));
  assert.equal(groupRows.length, 18);
  assert.deepEqual([...new Set(groupRows.map((m) => m.swiss_group))], [1, 2, 3, 4, 5, 6]);
  // Group A: 不会开飞机的郭子 wins the winners side, 吃荔枝的狐狸 the losers side.
  const a = groupRows.filter((m) => m.swiss_group === 1);
  const aPlayers = e.players.filter((p) => p.swiss_group === 1).map((p) => ({ id: p.id, seed: p.seed }));
  const placings = groupBracketPlacings('double_elim', aPlayers, a, 2);
  assert.deepEqual(placings.filter((p) => p.qualified).map((p) => p.player_id), ['不会开飞机的郭子', '吃荔枝的狐狸']);
  // The first winners match feeds the second; both winners-side losers drop to the losers match.
  const r1 = a.find((m) => m.key === 'g1:R1M1');
  assert.deepEqual([r1.next_key, r1.next_slot, r1.loser_next_key], ['g1:R2M1', 2, 'g1:R2M2']);
  assert.equal(a.find((m) => m.key === 'g1:R2M1').loser_next_key, 'g1:R2M2');
  // Playoff: double elimination with a bracket reset; invited players have no group.
  const playoff = e.matches.filter((m) => !['gwb', 'glb'].includes(m.bracket));
  assert.ok(playoff.some((m) => m.bracket === 'gf' && m.position === 2));
  assert.equal(e.players.find((p) => p.id === '_Arcturus_').swiss_group, null);
  assert.equal(e.grandFinalReset, true);
});

test('loser advances is detected when every scored winner has the lower score', () => {
  const row = (score1, score2, winner, status = 'completed') => ({
    player1_id: 'a', player2_id: 'b', score1, score2, status,
    winner_id: winner === 1 ? 'a' : 'b',
  });
  // Weekly #36 Beginners final: 6-1, the player on 1 moved on.
  assert.equal(isLoserAdvances([row(6, 1, 2), row(0, 2, 1), row(0, 0, 1, 'walkover')]), true);
  assert.equal(isLoserAdvances([row(2, 0, 1), row(1, 2, 2)]), false);
  assert.equal(isLoserAdvances([row(0, 2, 1), row(2, 1, 1)]), false, 'mixed: not loser advances');
  assert.equal(isLoserAdvances([row(0, 2, 1)]), false, 'one match is not enough');
});
