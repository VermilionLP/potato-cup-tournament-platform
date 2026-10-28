import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveDoubleElimRows } from '../lib/double-elim.js';
import {
  bracketKeys,
  buildWikiPage,
  doubleElimTemplate,
  inferBestOf,
  placementList,
  prizeSlots,
  singleElimTemplate,
  wikiId,
} from '../lib/liquipedia/export.js';
import { defaultWikiMeta, normalizePlace, normalizeWikiMeta } from '../lib/liquipedia/export-meta.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const deRows = (n) => resolveDoubleElimRows(ids(n)).map((r) => ({ ...r, id: r.key }));
const keyList = (rows, opts) => {
  const keys = bracketKeys(rows, opts);
  return [...keys.values()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
};
const players = (n) => ids(n).map((id, i) => ({ id, display_name: id, flag: i % 2 ? 'cn' : 'xx', link: '', seed: i + 1 }));

test('double elimination keys follow the Liquipedia templates', () => {
  // Potato_Cup/2026/June/Europe playoff (8 players, Bracket/8U4L2DSL1D).
  assert.deepEqual(keyList(deRows(8), { double: true }), [
    'R1M1', 'R1M2', 'R1M3', 'R1M4', 'R1M5', 'R1M6', 'R2M1', 'R2M2', 'R2M3', 'R2M4', 'R3M1', 'R4M1', 'R4M2', 'R5M1', 'RxMBR',
  ].filter((k) => k !== 'RxMBR'));
  // Potato_Cup/2026/Aug/Asia_Pacific (12 players, Bracket/8L4DSSU8L2DSL1D).
  assert.deepEqual(keyList(deRows(12), { double: true }), [
    'R1M1', 'R1M2', 'R1M3', 'R1M4',
    'R2M1', 'R2M2', 'R2M3', 'R2M4', 'R2M5', 'R2M6', 'R2M7', 'R2M8',
    'R3M1', 'R3M2', 'R4M1', 'R4M2', 'R4M3', 'R4M4', 'R5M1', 'R6M1', 'R6M2', 'R7M1',
  ]);
  assert.equal(doubleElimTemplate(8).name, 'Bracket/8U4L2DSL1D');
  assert.equal(doubleElimTemplate(12).name, 'Bracket/8L4DSSU8L2DSL1D');
  assert.equal(doubleElimTemplate(16).name, 'Bracket/16U8L4DSL2DSL1D');
  assert.equal(doubleElimTemplate(6).compact, false);
});

test('the grand-final reset is RxMBR', () => {
  const rows = deRows(4);
  rows.push({ id: 'reset', bracket: 'gf', round: 1, position: 2, player1_id: 'p1', player2_id: 'p2', status: 'pending' });
  assert.equal(bracketKeys(rows, { double: true }).get('reset'), 'RxMBR');
});

test('single elimination leaves first-round byes out (Bracket/4L2DH8LS for 14)', () => {
  // 16 slots, 14 players: two first-round byes.
  const rows = [];
  let n = 0;
  for (let round = 4; round >= 1; round -= 1) {
    for (let position = 1; position <= 2 ** (round - 1); position += 1) {
      const bye = round === 4 && (position === 1 || position === 5);
      rows.push({
        id: `m${++n}`,
        bracket: 'main',
        round,
        position,
        player1_id: round === 4 ? `a${position}` : null,
        player2_id: round === 4 && !bye ? `b${position}` : null,
        status: bye ? 'completed' : 'pending',
        winner_id: bye ? `a${position}` : null,
      });
    }
  }
  assert.equal(singleElimTemplate(14).name, 'Bracket/4L2DH8LS');
  const keys = bracketKeys(rows);
  assert.deepEqual(
    [...keys.values()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
    ['R1M1', 'R1M2', 'R1M3', 'R1M4', 'R1M5', 'R1M6', 'R2M1', 'R2M2', 'R2M3', 'R2M4', 'R3M1', 'R3M2', 'R4M1'],
  );
  // a2 vs b2 is the first match shown (a1 had a bye).
  assert.equal(keys.get('m2'), 'R1M1');
});

test('prize slots merge the points table with the prize money', () => {
  const slots = prizeSlots(
    [{ from: 1, to: 1, points: 300 }, { from: 2, to: 2, points: 180 }, { from: 9, to: 12, points: 20 }],
    [{ place: '1', localprize: '374', freetext: '10000' }, { place: '5-6', localprize: '49', freetext: '' }],
    ['2'],
  );
  assert.deepEqual(slots.map((s) => [s.place, s.localprize, s.points, s.qualified]), [
    ['1', '374', 300, false],
    ['2', '', 180, true],
    ['5-6', '49', null, false],
    ['9-12', '', 20, false],
  ]);
});

test('helpers: ids, placements, best-of, places', () => {
  const a = wikiId('weekly-40', 'r1');
  assert.match(a, /^[a-z0-9]{10}$/);
  assert.notEqual(a, wikiId('weekly-40', 'r2'));
  assert.equal(wikiId('weekly-40', 'r1'), a);
  const places = new Map([['a', { from: 1, to: 1 }], ['b', { from: 2, to: 2 }], ['c', { from: 3, to: 4 }], ['d', { from: 3, to: 4 }]]);
  assert.equal(placementList(places), '1;2;3-4');
  assert.equal(inferBestOf([{ status: 'completed', player1_id: 'a', player2_id: 'b', score1: 3, score2: 1 }]), 5);
  assert.equal(inferBestOf([]), null);
  assert.equal(normalizePlace(' 3 - 4 '), '3-4');
  assert.equal(normalizePlace('4-3'), '');
});

test('settings are cleaned and talent carries over to a new event', () => {
  const meta = normalizeWikiMeta({
    tier: '9',
    currency: 'eur',
    bestOf: { group: 3, playoff: 4 },
    prizes: [{ place: '1', localprize: '¥374', freetext: 'x' }, { place: 'first' }],
    talents: [{ position: 'Host', people: [{ name: 'A|B', flag: 'CN!' }, { name: '' }] }, { people: [] }],
    qualifies: { name: 'Winter', places: '1, 2，x' },
    extra: 'dropped',
  });
  assert.equal(meta.tier, '');
  assert.equal(meta.currency, 'cny');
  assert.deepEqual(meta.bestOf, { group: 3, playoff: null, final: null });
  assert.deepEqual(meta.prizes, [{ place: '1', localprize: '374', freetext: 'x' }]);
  assert.deepEqual(meta.talents, [{ position: 'Host', lang: '', people: [{ name: 'AB', flag: 'cn' }] }]);
  assert.equal(meta.qualifies.places, '1,2');
  assert.equal(meta.extra, undefined);

  const fresh = defaultWikiMeta({ points_kind: 'weekly' });
  assert.equal(fresh.talents[0].position, 'Host');
  assert.equal(fresh.prizes[0].localprize, '136');
  const carried = defaultWikiMeta({ points_kind: 'monthly', points_invite: true }, { ...meta, __kind: 'weekly' });
  assert.equal(carried.talents[0].people[0].name, 'AB');
  assert.equal(carried.prizes[0].localprize, '374'); // monthly defaults, not the weekly event's prizes
  assert.equal(carried.qualifies.places, '1');
});

test('Swiss weekly page: Swiss table and one match list per round', () => {
  const t = {
    id: 'weekly-12', name: 'Potato Cup Weekly 12', status: 'completed', format: 'swiss', game_mode: 'sb',
    points_kind: 'weekly', points_season: '2026', scheduled_time: '2025-05-04T20:00',
    points_table: [{ from: 1, to: 1, points: 30 }],
  };
  const matches = [
    { id: 1, bracket: 'sw', round: 1, position: 1, player1_id: 'p1', player2_id: 'p2', status: 'completed', winner_id: 'p2', score1: 1, score2: 3 },
    { id: 2, bracket: 'sw', round: 1, position: 2, player1_id: 'p3', player2_id: 'p4', status: 'walkover', winner_id: 'p3' },
    { id: 3, bracket: 'sw', round: 2, position: 1, player1_id: 'p2', player2_id: 'p3', status: 'completed', winner_id: 'p2', score1: 3, score2: 0 },
  ];
  const placements = new Map([['p2', { from: 1, to: 1 }], ['p3', { from: 2, to: 2 }], ['p1', { from: 3, to: 4 }], ['p4', { from: 3, to: 4 }]]);
  const { text, warnings } = buildWikiPage({ t, players: players(4), matches, placements, meta: defaultWikiMeta(t) });
  assert.deepEqual(warnings, []);
  assert.match(text, /^\{\{DISPLAYTITLE:Potato Cup Weekly #\{\{SUBPAGENAME\}\} \(土豆杯周赛#\{\{SUBPAGENAME\}\}\)\}\}/);
  assert.match(text, /\|mode=SB\n/);
  assert.match(text, /\|liquipediatier=4 \|liquipediatiertype=Weekly/);
  assert.match(text, /\* All matches are \{\{Abbr\/Bo5\}\}/);
  assert.match(text, /\{\{SwissTableLeague\|placements=1;2;3-4\n/);
  assert.match(text, /==\{\{HiddenSort\|Round 1\}\}===\n\{\{Matchlist\|id=[a-z0-9]{10}\|title=Round 1\|collapsed=1/);
  assert.match(text, /\|M1=\{\{Match\|bestof=5\|matchsection=Round 1\n {4}\|date=2025-05-04 - 20:00 \{\{Abbr\/CST\}\}\n {4}\|opponent1=\{\{SoloOpponent\|p1=p1\|score=1\}\}\n {4}\|opponent2=\{\{SoloOpponent\|p1=p2\|flag=cn\|score=3\}\}/);
  assert.match(text, /opponent1=\{\{SoloOpponent\|p1=p3\|score=W\}\}\n {4}\|opponent2=\{\{SoloOpponent\|p1=p4\|flag=cn\|score=FF\}\}/);
  assert.match(text, /\|\{\{Slot\|place=1\|localprize=136\|points=30\}\}/);
  assert.match(text, /\|points1=PotatoCup Leaderboard 2026\|points1link=Potato_Cup\/Leaderboard\/2026/);
  assert.match(text, /\{\{BroadcasterCard\n\|position=Host\|lang=English\n\|b1=Vermilion\n\}\}/);
});

test('Swiss groups + double-elimination playoff page', () => {
  const t = {
    id: 'june-eu', name: 'Potato Cup 2026 June Cup - Europe', status: 'in_progress', format: 'swiss',
    playoff_format: 'double_elim', current_stage: 'playoff', advance_per_group: 2, game_mode: 'rb',
    points_kind: 'monthly', scheduled_time: '2026-06-13T20:00',
  };
  const group = (g, round, position, a, b, winner) => ({ id: `g${g}${round}${position}`, bracket: 'sw', swiss_group: g, round, position, player1_id: a, player2_id: b, status: 'completed', winner_id: winner, score1: winner === a ? 2 : 0, score2: winner === b ? 2 : 0 });
  const matches = [
    group(1, 1, 1, 'p1', 'p2', 'p1'), group(1, 1, 2, 'p3', 'p4', 'p3'), group(1, 2, 1, 'p1', 'p3', 'p1'),
    group(2, 1, 1, 'p5', 'p6', 'p5'), group(2, 1, 2, 'p7', 'p8', 'p8'),
    ...deRows(4).map((r) => ({ ...r, id: `po-${r.id}` })),
  ];
  const groupStage = { groups: [{ label: 'A', rows: [{}, {}, {}, {}] }, { label: 'B', rows: [{}, {}, {}, {}] }] };
  const meta = normalizeWikiMeta({ ...defaultWikiMeta(t), endDate: '2026-06-14', bestOf: { playoff: 5 } });
  const { text, warnings } = buildWikiPage({ t, players: players(8), matches, groupStage, meta });
  assert.equal(warnings[0], '赛事还没有结束，导出的是当前进度。');
  assert.match(text, /\|sdate=2026-06-13\n\|edate=2026-06-14/);
  assert.match(text, /\* '''Group Stage:''' \n\*\* Swiss-Round\n\*\* All matches are \{\{Abbr\/Bo3\}\}\n\*\* Top 2 of each group advance/);
  assert.match(text, /\*\* Double-Elimination bracket\n\*\* All matches are \{\{Abbr\/Bo5\}\}/);
  assert.match(text, /===\{\{Stage\|Group Stage\}\}===\n\{\{Toggle group start\|state=show\}\}/);
  assert.match(text, /\{\{GroupTableLeague\|id=([A-Za-z0-9]{10})\n\|date=2026-06-13\n\|title=Group A\|width=320px\n\|pbg1=up\|pbg3=down\n\}\}\n\{\{Matchlist\|id=\1\|width=320\|title=Group A Matches\|collapsed=true/);
  assert.match(text, /\|M3=\{\{Match\|bestof=3\|matchsection=Round 2/);
  assert.match(text, /===\{\{Stage\|Playoffs\}\}===\n<section begin=Results \/>\n\{\{Toggle bracket start\|sdate=2026-06-14\|dateexact=true\}\}\n\{\{Bracket\|Bracket\/4U2L1D\|id=/);
  assert.equal((text.match(/\{\{Matchlist/g) || []).length, 2);
  assert.match(text, /<!-- Grand Final -->\n\|R\d+M1=\{\{Match\|bestof=5/);
});
