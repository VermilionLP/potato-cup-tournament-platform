import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_API_URL, eventSpaded, matchExcluded, parseSpaded, quotaLeft, RESERVE, statsharkConfig, statsharkProblem, syncEventSpaded } from '../lib/statshark.js';
import { copyList, normalizeStatsharkId, spadedExcluded, spadedNames, unitKey, vehicleFamilies, withoutExcluded } from '@potato-cup/shared/spaded.js';

// The few queries lib/statshark.js makes, on plain objects.
function fakeDb({ players = [], event = [], usage = 0 } = {}) {
  const state = { players: new Map(players.map((p) => [p.id, { spaded_units: null, spaded_fetched_at: null, spaded_error: null, ...p }])), event: new Set(event), usage };
  return {
    state,
    async query(sql, params = []) {
      if (/FROM axsuck\.statshark_usage/.test(sql)) return { rows: state.usage ? [{ requests: state.usage }] : [] };
      if (/INSERT INTO axsuck\.statshark_usage/.test(sql)) {
        state.usage += 1;
        return { rows: [] };
      }
      if (/UPDATE axsuck\.players SET spaded_units/.test(sql)) {
        Object.assign(state.players.get(params[0]), { spaded_units: params[1], spaded_fetched_at: new Date(), spaded_error: null });
        return { rows: [] };
      }
      if (/UPDATE axsuck\.players SET spaded_error/.test(sql)) {
        state.players.get(params[0]).spaded_error = params[1];
        return { rows: [] };
      }
      if (/FROM axsuck\.tournament_players/.test(sql)) {
        let rows = [...state.players.values()].filter((p) => state.event.has(p.id));
        if (/statshark_id IS NOT NULL/.test(sql)) rows = rows.filter((p) => p.statshark_id);
        if (params[1]) rows = rows.filter((p) => params[1].includes(p.id));
        return { rows };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}
const cfg = statsharkConfig({ STATSHARK_API_URL: 'https://api.statshark.test/player/{id}', STATSHARK_API_KEY: 'k', STATSHARK_DAILY_LIMIT: '350' });
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test('Statshark ids: a number or a profile link', () => {
  assert.equal(normalizeStatsharkId('67556271'), '67556271');
  assert.equal(normalizeStatsharkId(' https://statshark.net/player/67556271#Vehicles '), '67556271');
  assert.equal(normalizeStatsharkId('statshark.net/zh/player/123'), '123');
  assert.equal(normalizeStatsharkId(''), '');
  assert.equal(normalizeStatsharkId('_WestOver_'), null);
});

test('spaded vehicles are read from the usual response shapes', () => {
  assert.deepEqual(parseSpaded({ spaded: ['f_15e', 'Su-27SM'] }), ['f15e', 'su27sm']);
  assert.deepEqual(parseSpaded({ vehicles: [{ unit: 'p-47d-28', spaded: true }, { unit: 'bf-109f-4', spaded: false }, { name: 'Spitfire F Mk IX', isSpaded: 1 }] }), ['p47d28', 'spitfirefmkix']);
  assert.deepEqual(parseSpaded({ data: { player: { vehicles: [{ id: 'mig_29smt_9_19', aced: true }] } } }), ['mig29smt919']);
  assert.deepEqual(parseSpaded({ vehicles: [{ id: 'a10a', battles: 3 }] }), [], 'no spaded flag, not under a spaded key: nothing');
});

test('the Statshark answer: SpadeInfo status 2 is spaded; unreadable profiles are errors', () => {
  const body = { Basics: { uid: '67556271' }, SpadeInfo: { country_usa: { f_15e: 2, f_16a: 1, a_10a: 0 }, country_ussr: { su_27sm: 2 }, country_china: null } };
  assert.deepEqual(parseSpaded(body), ['f15e', 'su27sm']);
  assert.equal(statsharkProblem(body), null);
  assert.match(statsharkProblem({ Message: 'OLD_PROFILE' }), /太旧/);
  assert.match(statsharkProblem({ message: 'Failed to retrieve player data' }), /读不到/);
  assert.ok(statsharkProblem({}));
  // The key alone turns it on, with statshark.net's endpoint and header.
  const c = statsharkConfig({ STATSHARK_API_KEY: ' secret ' });
  assert.deepEqual([c.enabled, c.url, c.header, c.key], [true, DEFAULT_API_URL, 'X-Turnstile-Token', 'secret']);
  assert.equal(statsharkConfig({ STATSHARK_API_URL: DEFAULT_API_URL }).enabled, false, 'no key: off');
});

test('a profile Statshark can\'t read, or a key turned down', async () => {
  const db = fakeDb({ event: ['a', 'b', 'c'], players: [{ id: 'a', statshark_id: '1', spaded_units: ['x'] }, { id: 'b', statshark_id: '2' }, { id: 'c', statshark_id: '3' }] });
  const r = await syncEventSpaded(db, 't', { cfg, fetchImpl: async (url) => (url.endsWith('/1') ? ok({ Message: 'OLD_PROFILE' }) : ok({ Basics: {}, SpadeInfo: { country_usa: { f_15e: 2 } } })) });
  assert.deepEqual({ fetched: r.fetched, failed: r.failed }, { fetched: 2, failed: 1 });
  assert.match(db.state.players.get('a').spaded_error, /太旧/);
  assert.deepEqual(db.state.players.get('a').spaded_units, ['x'], 'the last list is kept');
  const denied = await syncEventSpaded(db, 't', { cfg, force: true, fetchImpl: async () => ({ ok: false, status: 406 }) });
  assert.deepEqual({ failed: denied.failed, pending: denied.pending }, { failed: 1, pending: 2 }, 'a wrong key stops the fetch');
});

test('a match keeps the pool vehicles both players have spaded; copies count as the same vehicle', () => {
  const pool = [
    { name: 'F-15E', unit: 'f_15e', group: 'A' },
    { name: 'Su-27SM', unit: 'su_27sm', group: 'A' },
    { name: 'J-10C', unit: 'j_10c', group: 'B' },
    { name: 'J-11', unit: 'j_11', group: 'B', copy_of: 'Su-27SM' }, // a copy of a pool vehicle
    { name: 'MiG-15bis (CN)', unit: 'mig_15bis_china', group: 'C', copy_of: 'mig_15bis; mig_15bis_hungary' }, // copies outside the pool
  ];
  const a = spadedNames(pool, new Set(['f15e', 'su27sm', 'mig15bis']));
  const b = spadedNames(pool, new Set(['f15e', 'j11', 'mig15bishungary', 'j10c']));
  assert.deepEqual(a.sort(), ['F-15E', 'J-11', 'MiG-15bis (CN)', 'Su-27SM']);
  assert.deepEqual(b.sort(), ['F-15E', 'J-10C', 'J-11', 'MiG-15bis (CN)', 'Su-27SM']);
  // Both: F-15E, the Su-27SM / J-11 family, the MiG-15bis; J-10C is only b's.
  assert.deepEqual(spadedExcluded(pool, a, b), ['J-10C']);
  assert.deepEqual(spadedExcluded(pool, a, null), [], 'no data for one player: nothing left out');
  assert.deepEqual(spadedExcluded(pool, ['F-15E'], ['J-10C']), [], 'nothing in common: nothing left out');
  assert.deepEqual(withoutExcluded(pool, ['J-10C']).map((v) => v.name), ['F-15E', 'Su-27SM', 'J-11', 'MiG-15bis (CN)']);
  assert.equal(unitKey('Su-27SM'), 'su27sm');
  assert.deepEqual(copyList('Bf 109 F-4; bf-109f-4_hungary、A6M2'), ['Bf 109 F-4', 'bf-109f-4_hungary', 'A6M2']);
  // Copies chain: C is a copy of B, B of A: one family.
  const chain = vehicleFamilies([{ name: 'A' }, { name: 'B', copy_of: 'A' }, { name: 'C', copy_of: 'B' }, { name: 'D' }]);
  assert.ok(chain.get('C').has('a'));
  assert.ok(!chain.get('D').has('a'));
});

test('an event\'s players are matched to the pool by unit id, name or copy', async () => {
  const db = fakeDb({
    event: ['a', 'b', 'c'],
    players: [
      { id: 'a', statshark_id: '1', spaded_units: ['f15e', 'j10c'] },
      { id: 'b', statshark_id: '2', spaded_units: ['su27sm'] },
      { id: 'c', statshark_id: null },
    ],
  });
  const pool = [
    { name: 'F-15E Strike Eagle', unit: 'f_15e', group: 'A' },
    { name: 'Su-27SM', group: 'A' },
    { name: 'J-10C', unit: 'j_10c', group: 'B' },
    { name: 'Gripen', unit: 'saab_jas39c', group: 'B' },
    { name: 'J-11', unit: 'j_11', group: 'B', copy_of: 'Su-27SM' },
  ];
  const data = await eventSpaded(db, 't', pool);
  assert.deepEqual(data.a.has, ['F-15E Strike Eagle', 'J-10C']);
  assert.deepEqual(data.b.has.sort(), ['J-11', 'Su-27SM'], 'the copy counts');
  assert.equal(data.c.has, null);
  assert.equal(data.c.linked, false);
  // a and b have no spaded vehicle in common: nothing is left out.
  assert.deepEqual(await matchExcluded(db, 't', pool, 'a', 'b'), []);
  db.state.players.get('b').spaded_units = ['su27sm', 'f15e'];
  assert.deepEqual(await matchExcluded(db, 't', pool, 'a', 'b'), ['Su-27SM', 'J-10C', 'Gripen', 'J-11'], 'only the F-15E both have');
  assert.deepEqual(await matchExcluded(db, 't', pool, 'a', 'c'), [], 'c has no data');
});

test('the start of an event fetches its linked players once, counting requests against the daily limit', async () => {
  const db = fakeDb({
    event: ['a', 'b', 'c', 'd'],
    players: [
      { id: 'a', statshark_id: '1' },
      { id: 'b', statshark_id: '2' },
      { id: 'c', statshark_id: '3', spaded_units: ['old'], spaded_fetched_at: new Date() }, // fetched an hour ago by another event
      { id: 'd', statshark_id: null },
    ],
  });
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push([url, opts.headers['X-Turnstile-Token'], opts.method]);
    return url.endsWith('/2') ? { ok: false, status: 404 } : ok({ Basics: { uid: '1' }, SpadeInfo: { country_usa: { f_15e: 2, f_16a: 1 } } });
  };
  const r = await syncEventSpaded(db, 't', { cfg, fetchImpl });
  assert.deepEqual({ fetched: r.fetched, failed: r.failed, skipped: r.skipped, pending: r.pending }, { fetched: 1, failed: 1, skipped: 1, pending: 0 });
  assert.deepEqual(calls.map((c) => c[0]).sort(), ['https://api.statshark.test/player/1', 'https://api.statshark.test/player/2']);
  assert.deepEqual(calls[0].slice(1), ['k', 'POST'], 'the key as it is in X-Turnstile-Token, by POST');
  assert.deepEqual(db.state.players.get('a').spaded_units, ['f15e']);
  assert.match(db.state.players.get('b').spaded_error, /没有这个 ID/);
  assert.equal(db.state.usage, 2, 'both requests counted');
  assert.equal(r.left, 348);
  // An admin's refresh fetches the recent one too.
  const again = await syncEventSpaded(db, 't', { cfg, fetchImpl, force: true });
  assert.equal(again.skipped, 0);
  assert.equal(again.fetched, 2);
});

test('fetching stops before the daily limit (a reserve is kept, an admin can use it)', async () => {
  const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, statshark_id: String(i + 1) }));
  const db = fakeDb({ event: players.map((p) => p.id), players, usage: 350 - RESERVE - 2 });
  const r = await syncEventSpaded(db, 't', { cfg, fetchImpl: async () => ok({ Basics: {}, SpadeInfo: {} }) });
  assert.equal(r.fetched, 2);
  assert.equal(r.pending, 3);
  assert.equal(await quotaLeft(db, cfg), RESERVE);
  const forced = await syncEventSpaded(db, 't', { cfg, fetchImpl: async () => ok({ Basics: {}, SpadeInfo: {} }), force: true });
  assert.equal(forced.fetched, 5 > RESERVE ? RESERVE : 5);
  // The API's own "too many": the rest wait, the last list is kept.
  const db2 = fakeDb({ event: ['a', 'b', 'c'], players: [{ id: 'a', statshark_id: '1', spaded_units: ['x'] }, { id: 'b', statshark_id: '2' }, { id: 'c', statshark_id: '3' }] });
  const r2 = await syncEventSpaded(db2, 't', { cfg, fetchImpl: async () => ({ ok: false, status: 429 }) });
  assert.deepEqual({ failed: r2.failed, pending: r2.pending }, { failed: 1, pending: 2 });
  assert.deepEqual(db2.state.players.get('a').spaded_units, ['x']);
  // Not set up: nothing happens.
  assert.equal((await syncEventSpaded(db2, 't', { cfg: statsharkConfig({}) })).disabled, true);
});
