import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import tssRoutes from '../routes/tss.js';
import { buildRoutes, fakeDb } from './helpers/route-harness.js';
import { createTssClient } from '../lib/tss/client.js';

process.env.ADMIN_TOKEN = 'test-admin-token';
const ADMIN = { 'x-admin-token': 'test-admin-token' };

// A TSS site answering from the 23359 fixture (1v1, 16 bracket), the way
// functions.php does: JSON strings inside the detail, team pages, match times.
function fakeTss() {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/tss/tss-23359.json', import.meta.url), 'utf8'));
  const row = ([id, typeBracket, idTeamA, realNameA, idTeamB, realNameB, scoreA, scoreB, matchResult, side]) => ({
    id, typeBracket, idTeamA, realNameA, idTeamB, realNameB, scoreA, scoreB, matchResult,
    teamA: `a${id}`, teamB: `b${id}`, winner: side === 1 ? `a${id}` : side === 2 ? `b${id}` : '',
  });
  const rounds = (rs) => rs.map((r) => r.map(row));
  const calls = [];
  const answer = (params) => {
    calls.push(params.get('action'));
    switch (params.get('action')) {
      case 'DetailTournament':
        return params.get('id') === '23359' ? { ...raw.detail, listTeams: JSON.stringify(raw.detail.listTeams), rewards: JSON.stringify(raw.detail.rewards) } : { status: 'ERROR' };
      case 'GetArrayBracketData':
        return { status: 'OK', data: { bracket: { winner: { Winner: rounds(raw.bracket.winner.Winner), Final: rounds(raw.bracket.winner.Final) }, loser: { Looser: [], LooserFinal: [], Semifinal: [] } } } };
      case 'infoTeam':
        return { users_team: [{ nick: 'x', role: 'captain' }], param_tournaments: { statisticGroup: 'aircraft' } };
      case 'getInfoMatch':
        return { status: 'OK', data: { timeInviteMatch: 1764183960, timeStartMatch: 1764184020 } };
      default:
        return { status: 'ERROR' };
    }
  };
  const fetch = async (url, init) => {
    const params = init.method === 'POST' ? new URLSearchParams(init.body) : new URL(url).searchParams;
    return { ok: true, status: 200, text: async () => JSON.stringify(answer(params)) };
  };
  return { client: createTssClient({ fetch, base: 'https://tss.test' }), calls };
}

test('GET /tss/:id: the event, its rounds and numbered matches; bad ids and unknown events are refused', async () => {
  const { client } = fakeTss();
  const { inject } = await buildRoutes([(f) => tssRoutes(f, { client })], fakeDb({ row: { settings: null } }));
  const res = await inject({ method: 'GET', url: '/tss/23359', headers: ADMIN });
  assert.equal(res.statusCode, 200, res.error?.message);
  const { summary, matches, settings } = res.payload.data;
  assert.equal(summary.name, 'Jet Duel RB 1x1');
  assert.equal(summary.solo, true);
  assert.deepEqual(summary.upper_rounds.map((r) => r.teams), [16, 8, 4, 2]);
  assert.equal(matches.length, 15);
  assert.equal(settings.opponent, 'auto');
  assert.equal((await inject({ method: 'GET', url: '/tss/abc', headers: ADMIN })).statusCode, 400);
  assert.equal((await inject({ method: 'GET', url: '/tss/1', headers: ADMIN })).statusCode, 404);
  assert.equal((await inject({ method: 'GET', url: '/tss/23359', headers: {} })).statusCode, 401);
});

test('PUT /tss/:id/wiki: builds the page with match times, saves the settings', async () => {
  const { client, calls } = fakeTss();
  const db = fakeDb();
  const { inject } = await buildRoutes([(f) => tssRoutes(f, { client })], db);
  const res = await inject({ method: 'PUT', url: '/tss/23359/wiki', headers: ADMIN, body: { settings: { startRound: 2, tier: '5', tiertype: 'Weekly' } } });
  assert.equal(res.statusCode, 200, res.error?.message);
  const { wikiScript, warnings } = res.payload.data;
  assert.match(wikiScript, /\{\{Bracket\|Bracket\/8\|/);
  assert.ok(warnings.length);
  // 7 shown matches, one time request each; 1v1 needs no rosters beyond the vehicle class.
  assert.equal(calls.filter((c) => c === 'getInfoMatch').length, 7);
  assert.equal(calls.filter((c) => c === 'infoTeam').length, 1);
  assert.ok(db.writes.some((w) => w.startsWith('INSERT INTO axsuck.tss_exports')));
  const bad = await inject({ method: 'PUT', url: '/tss/23359/wiki', headers: ADMIN, body: { settings: { filter: { ranges: 'x-y' } } } });
  assert.equal(bad.statusCode, 400);
});

test('TSS out of reach: 502 with a readable message', async () => {
  const client = createTssClient({ fetch: async () => { throw new Error('ECONNREFUSED'); }, base: 'https://tss.test' });
  const { inject } = await buildRoutes([(f) => tssRoutes(f, { client })], fakeDb());
  const res = await inject({ method: 'GET', url: '/tss/23359', headers: ADMIN });
  assert.equal(res.statusCode, 502);
  assert.match(res.error.message, /无法连接 TSS/);
});
