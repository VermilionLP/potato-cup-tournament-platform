import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HELP, beijing, formatAchievements, formatAnswered, formatHeadToHead, formatLadder, formatPoints, formatRecap, formatReported, formatTop, formatUnknown,
  parseScore, resolveLookup, suggestCommand,
} from '../src/format.js';
import { unglue } from '../src/commands.js';
import { createRenderer } from '../src/cards.js';
import { HELP_GROUPS } from '../src/cards.js';

test('scores: own score first, many separators, an optional event', () => {
  assert.deepEqual(parseScore('2:1'), { mine: 2, theirs: 1, event: '' });
  assert.deepEqual(parseScore('2：1'), { mine: 2, theirs: 1, event: '' });
  assert.deepEqual(parseScore('0-2'), { mine: 0, theirs: 2, event: '' });
  assert.deepEqual(parseScore('3比2 Weekly #34'), { mine: 3, theirs: 2, event: 'Weekly #34' });
  assert.deepEqual(parseScore('2 1'), { mine: 2, theirs: 1, event: '' });
  for (const bad of ['', '21', 'a:b', '2:']) assert.equal(parseScore(bad), null, bad);
  assert.equal(unglue('报分2:1'), '报分 2:1');
  assert.equal(unglue('Top20'), 'top20');
  assert.equal(unglue('TOP 20'), 'top20');
});

test('report and answer replies', () => {
  const base = { tournament: 'Weekly #34', me: 'Alpha', opponent: 'Bravo', mine: 2, theirs: 1 };
  assert.match(formatReported({ ...base, result: 'pending' }), /等 Bravo 确认/);
  assert.match(formatReported({ ...base, result: 'confirmed' }), /已生效/);
  assert.match(formatReported({ ...base, result: 'disputed' }), /管理员/);
  assert.match(formatAnswered({ ...base, result: 'confirmed', report: { mine: 1, theirs: 2 } }), /Alpha 1 : 2 Bravo，比分已生效/);
  assert.match(formatAnswered({ ...base, result: 'disputed' }), /提出异议/);
});

test('names: exact, any case, an old name, one near match, or a list', () => {
  assert.deepEqual(resolveLookup('A', { exact: { id: 'A' } }), { id: 'A' });
  assert.equal(resolveLookup('vermilion', { similar: [{ id: 'Vermilion' }, { id: 'Vermi' }] }).id, 'Vermilion');
  assert.equal(resolveLookup('old', { alias: { alias: 'old', player: { id: 'New' } } }).id, 'New');
  assert.match(resolveLookup('Kirto', { similar: [{ id: 'Kirito_0_1' }] }).note, /Kirito_0_1/);
  assert.match(resolveLookup('K', { similar: [{ id: 'Ka' }, { id: 'Kb' }] }).message, /你是不是要找：Ka、Kb/);
  assert.match(resolveLookup('zzz', { similar: [] }).message, /没有找到选手/);
});

test('typos get a suggestion; nonsense gets the help pointer', () => {
  assert.equal(suggestCommand('报命'), '报名');
  assert.equal(suggestCommand('战积 Alpha'), '战绩');
  assert.equal(suggestCommand('确定'), '确认');
  assert.equal(suggestCommand('异议'), '有异议');
  assert.equal(suggestCommand('ok'), null);
  assert.match(formatUnknown('天体'), /「天梯」/);
  assert.match(formatUnknown('今天几点比赛'), /发送「帮助」/);
});

test('help lists every new command, in text and on the card', () => {
  const card = HELP_GROUPS.flatMap(([, , rows]) => rows.map(([c]) => c));
  for (const c of ['报分 2:1', '确认', '有异议', '交手 选手名', '天梯', '积分', 'Top20', '成就', '回顾']) {
    assert.ok(card.includes(c), c);
    assert.ok(HELP.includes(c.split(' ')[0]), c);
  }
  assert.match(HELP, /私聊/);
});

test('ranking and player text replies', () => {
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `P${i + 1}`, rank: i + 1, mmr: 3300 - i * 10, tier: { name: '大师' } }));
  assert.match(formatLadder(players, players[11]), /…\n12\. P12/);
  const points = { season: '2026', boards: [{ pool: 'prop', players: players.map((p) => ({ ...p, total: 100 - p.rank })) }] };
  assert.match(formatPoints(points, 'P9'), /【螺旋桨】[\s\S]*…\n9\. P9 — 91 分/);
  assert.match(formatTop('2026', { size: 0 }), /还没有公布/);
  const view = { size: 20, start_at: '2026-12-01T12:00:00Z', started: true, revealed: [{ rank: 20, id: 'X' }, { rank: 19, id: 'Y', recap: { player: { name: 'Why' } } }], next: { rank: 18, at: '2026-12-03T12:00:00Z' } };
  assert.match(formatTop('2026', view), /19\. Why\n20\. X\n下一位（第 18 名）：12-03 20:00/);
  assert.equal(beijing('2026-12-01T12:00:00Z'), '2026-12-01T20:00');
  assert.match(formatAchievements('A', { earned: 1, total: 3, achievements: [{ title: '首冠', earned: true }, { title: '老兵', value: 4, target: 10, desc: 'd' }] }), /已获得：首冠[\s\S]*老兵（4\/10）/);
  const h = { a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' }, series: { a: 2, b: 1 }, games: { a: 5, b: 3 }, total: 3, meetings: [{ event: { name: 'W1' }, score_a: 2, score_b: 1, winner: 'a', vehicle: 'T-80B' }, { event: { name: 'W2' }, walkover: true, winner: 'b' }] };
  assert.match(formatHeadToHead(h), /比赛 2 : 1 · 小局 5 : 3[\s\S]*W1 — 2 : 1 · T-80B[\s\S]*W2 — B 不战而胜/);
  assert.match(formatHeadToHead({ ...h, total: 0 }), /还没有/);
  assert.match(formatRecap({ season: '2026', player: { name: 'A' }, events: 4, wins: 7, losses: 2, win_rate: 7 / 9, titles: 2, podiums: 3, best_streak: 7, points: { total: 245, rank: 1, of: 8 } }), /年度积分 245（第 1 名 \/ 8 人）[\s\S]*胜率 78%/);
});

test('the new cards render to PNG, empty ones too', async () => {
  const r = createRenderer();
  const now = new Date('2026-11-12T08:00:00Z');
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `Player_${i}`, rank: i + 1, mmr: 3300 - i * 10, wins: 3, losses: 1, flag: 'cn', tier: { group: 'master', name: '大师 I' } }));
  const outs = await Promise.all([
    r.ladder({ players, me: players[11] }, now),
    r.ladder({ players: [] }, now),
    r.points({ data: { season: '2026', boards: [{ pool: 'prop', players: players.map((p) => ({ ...p, total: 50, events: 3 })) }] }, meId: 'Player_9' }, now),
    r.points({ data: { season: '2026', boards: [] } }, now),
    r.top({ season: '2026', view: { size: 20, start_at: '2026-12-01T12:00:00Z', started: true, revealed: [{ rank: 20, id: 'A', recap: { player: { name: 'A' }, events: 3, wins: 2, losses: 1 } }], next: { rank: 19, at: '2026-12-02T12:00:00Z' } } }, now),
    r.top({ season: '2026', view: { size: 0, revealed: [] } }, now),
    r.achievements({ player: { id: 'A', name: 'A', flag: 'cn' }, data: { earned: 1, total: 3, achievements: [{ id: 'first-title', title: '首冠', desc: 'd', earned: true, value: 1, target: 1 }, { id: 'events-10', title: '老兵', desc: 'd', earned: false, value: 4, target: 10 }, { id: 'iron', title: '全勤', desc: 'd', earned: false, value: 0, target: 10 }] } }, now),
    r.headToHead({ a: { id: 'a', name: 'A', flag: 'cn' }, b: { id: 'b', name: 'B', flag: 'ru' }, series: { a: 1, b: 0 }, games: { a: 2, b: 1 }, total: 1, vehicles: [{ name: 'T-80B', times: 1 }], meetings: [{ event: { name: 'Weekly #1', date: '2026-11-01T12:00:00Z' }, score_a: 2, score_b: 1, winner: 'a', vehicle: 'T-80B' }] }, now),
    r.headToHead({ a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' }, series: { a: 0, b: 0 }, games: { a: 0, b: 0 }, total: 0, vehicles: [], meetings: [] }, now),
    r.recap({ season: '2026', player: { name: 'A', flag: 'cn' }, events: 4, wins: 7, losses: 2, win_rate: 0.7, titles: 2, podiums: 3, best_streak: 7, peak_mmr: 3398, title_events: [{ name: 'Potato Cup Weekly #31', date: '2026-01-01' }], rival: { name: 'B', played: 4, won: 2 }, vehicle: { name: 'T-80B', times: 2 }, points: { total: 245, rank: 1, of: 8 } }, now),
    r.recap({ season: '2026', player: { name: 'A' }, events: 0 }, now),
  ]);
  for (const png of outs) assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('the results picture renders', async () => {
  const r = createRenderer();
  const rows = ['A', 'Bravo_Long_Name_123', 'C', 'D', 'E', 'F', 'G', 'H'].map((id, i) => {
    const from = i < 2 ? i + 1 : i < 4 ? 3 : 5;
    const to = i < 2 ? from : i < 4 ? 4 : 8;
    return { id, name: id, flag: 'cn', from, to, place: from === to ? String(from) : `${from}-${to}`, points: [10, 6, 3, 3, 1, 1, 1, 1][i], prize: i ? 0 : 500 };
  });
  const png = await r.final({ event: 'Weekly #40', day: '2026-11-12', players: 16, rows }, new Date('2026-11-12T14:00:00Z'));
  assert.ok(png.length > 1000);
  if (process.env.CARD_OUT) (await import('node:fs')).writeFileSync(process.env.CARD_OUT, png);
});
