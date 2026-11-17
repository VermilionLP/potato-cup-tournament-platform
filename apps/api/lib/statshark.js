// Spaded vehicles from Statshark (statshark.net), for Ban / Pick: when an
// event starts, its players who entered a Statshark id get their spaded
// vehicles fetched once and kept on the player (players.spaded_units), so
// the next event refreshes them. The API allows STATSHARK_DAILY_LIMIT
// requests a day (350); every request is counted in statshark_usage and
// fetching stops before the limit (a margin is kept for admins' refreshes).
//
// Settings (apps/api/.env):
//   STATSHARK_API_URL    the player endpoint, with {id} for the Statshark id
//   STATSHARK_API_KEY    sent as STATSHARK_API_HEADER (default: Authorization:
//                        Bearer <key>; a header name other than
//                        Authorization gets the key as it is)
//   STATSHARK_DAILY_LIMIT  requests a day (default 350)
// Without STATSHARK_API_URL nothing is fetched.
//
// parseSpaded() reads the response. Until the API's documentation is in,
// it takes the usual shapes: a list of vehicle ids / names under a key
// with "spade" in it, or a list of vehicle objects with a spaded flag.

import { spadedExcluded, spadedNames, unitKey } from '@potato-cup/shared/spaded.js';

export const DEFAULT_DAILY_LIMIT = 350;
// Requests kept back for refreshes by hand when an event's fetch stops.
export const RESERVE = 10;
// A player fetched this recently (another event starting) isn't fetched again.
export const FRESH_HOURS = 12;
const TIMEOUT_MS = 15_000;

export function statsharkConfig(env = process.env) {
  const url = String(env.STATSHARK_API_URL || '').trim();
  const limit = Number(env.STATSHARK_DAILY_LIMIT);
  return {
    enabled: Boolean(url && url.includes('{id}')),
    url,
    key: String(env.STATSHARK_API_KEY || '').trim(),
    header: String(env.STATSHARK_API_HEADER || 'Authorization').trim(),
    dailyLimit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_DAILY_LIMIT,
  };
}

const SPADED_FLAG = /spade|aced|expert|mastered|fully_?upgraded|maxed/i;
const ID_FIELDS = ['unit', 'unit_id', 'unitId', 'internal_name', 'internalName', 'vehicle_id', 'vehicleId', 'id', 'vehicle', 'name', 'display_name', 'displayName'];

/** The spaded vehicles in an API response: unitKey()s (ids and names both kept). */
export function parseSpaded(body) {
  const keys = new Set();
  const addEntry = (entry) => {
    if (typeof entry === 'string') {
      if (unitKey(entry)) keys.add(unitKey(entry));
      return;
    }
    if (!entry || typeof entry !== 'object') return;
    for (const f of ID_FIELDS) if (typeof entry[f] === 'string' && unitKey(entry[f])) keys.add(unitKey(entry[f]));
  };
  const flagOf = (entry) => {
    const k = Object.keys(entry).find((key) => SPADED_FLAG.test(key));
    return k === undefined ? undefined : Boolean(entry[k]) && entry[k] !== 'false' && entry[k] !== 0;
  };
  const visit = (node, underSpadedKey, depth) => {
    if (depth > 6 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const entry of node) {
        if (typeof entry === 'string') {
          if (underSpadedKey) addEntry(entry);
        } else if (entry && typeof entry === 'object') {
          const flag = flagOf(entry);
          if (flag === true || (flag === undefined && underSpadedKey)) addEntry(entry);
          else if (flag === undefined) visit(entry, false, depth + 1);
        }
      }
      return;
    }
    for (const [key, value] of Object.entries(node)) visit(value, underSpadedKey || SPADED_FLAG.test(key), depth + 1);
  };
  visit(body, false, 0);
  return [...keys].sort();
}

const today = (now = new Date()) => now.toISOString().slice(0, 10);

/** Requests left today. */
export async function quotaLeft(db, cfg = statsharkConfig(), now = new Date()) {
  const row = (await db.query('SELECT requests FROM axsuck.statshark_usage WHERE day = $1', [today(now)])).rows[0];
  return Math.max(0, cfg.dailyLimit - (row?.requests || 0));
}

async function countRequest(db, now) {
  await db.query(
    `INSERT INTO axsuck.statshark_usage (day, requests) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET requests = axsuck.statshark_usage.requests + 1`,
    [today(now)],
  );
}

/** One player's spaded vehicles from the API (counted against the quota). */
export async function fetchSpaded(db, statsharkId, { cfg = statsharkConfig(), fetchImpl = fetch, now = new Date() } = {}) {
  if (!cfg.enabled) throw new Error('没有配置 Statshark API');
  await countRequest(db, now);
  const headers = { accept: 'application/json', 'user-agent': 'PotatoCup-spaded' };
  if (cfg.key) headers[cfg.header] = /^authorization$/i.test(cfg.header) && !/^\w+ /.test(cfg.key) ? `Bearer ${cfg.key}` : cfg.key;
  const res = await fetchImpl(cfg.url.replaceAll('{id}', encodeURIComponent(statsharkId)), { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) throw new Error('Statshark 上没有这个 ID');
  if (res.status === 429) throw Object.assign(new Error('Statshark 今天的次数用完了'), { quota: true });
  if (!res.ok) throw new Error(`Statshark 返回 ${res.status}`);
  return parseSpaded(await res.json());
}

/**
 * Fetches the spaded vehicles of an event's players who have a Statshark
 * id, one after another, skipping those fetched in the last FRESH_HOURS
 * (unless `force`), and stopping while RESERVE requests are left (all of
 * them when `force`). Returns { fetched, failed, skipped, pending, left }.
 */
export async function syncEventSpaded(db, tournamentId, { force = false, cfg = statsharkConfig(), fetchImpl = fetch, log = null, now = () => new Date() } = {}) {
  const result = { fetched: 0, failed: 0, skipped: 0, pending: 0, left: 0 };
  if (!cfg.enabled) return { ...result, disabled: true };
  const players = (await db.query(
    `SELECT p.id, p.statshark_id, p.spaded_fetched_at
       FROM axsuck.tournament_players tp JOIN axsuck.players p ON p.id = tp.player_id
      WHERE tp.tournament_id = $1 AND p.statshark_id IS NOT NULL
      ORDER BY p.spaded_fetched_at ASC NULLS FIRST, p.id`,
    [tournamentId],
  )).rows;
  const keep = force ? 0 : RESERVE;
  for (const [i, p] of players.entries()) {
    const at = p.spaded_fetched_at ? new Date(p.spaded_fetched_at).getTime() : 0;
    if (!force && at && now().getTime() - at < FRESH_HOURS * 3600_000) {
      result.skipped += 1;
      continue;
    }
    if ((await quotaLeft(db, cfg, now())) <= keep) {
      result.pending += 1;
      continue;
    }
    try {
      const units = await fetchSpaded(db, p.statshark_id, { cfg, fetchImpl, now: now() });
      await db.query(
        'UPDATE axsuck.players SET spaded_units = $2, spaded_fetched_at = NOW(), spaded_error = NULL WHERE id = $1',
        [p.id, units],
      );
      result.fetched += 1;
    } catch (e) {
      // Keep the last good list; note what went wrong.
      await db.query('UPDATE axsuck.players SET spaded_error = $2 WHERE id = $1', [p.id, String(e.message).slice(0, 200)]);
      result.failed += 1;
      log?.warn({ err: e, player: p.id }, 'statshark fetch failed');
      if (e.quota) {
        // The API says the day's requests are used up: the rest wait.
        result.pending += players.length - i - 1;
        break;
      }
    }
  }
  result.left = await quotaLeft(db, cfg, now());
  return result;
}

/**
 * Each event player's spaded vehicles among `vehicles` (the event's pool,
 * names, copies counted): { [playerId]: { has: [names] | null, fetched_at,
 * error, linked } }.
 * `has` is null when there is no data for them yet.
 */
export async function eventSpaded(db, tournamentId, vehicles = [], playerIds = null) {
  const rows = (await db.query(
    `SELECT p.id, p.statshark_id, p.spaded_units, p.spaded_fetched_at, p.spaded_error
       FROM axsuck.tournament_players tp JOIN axsuck.players p ON p.id = tp.player_id
      WHERE tp.tournament_id = $1 AND ($2::text[] IS NULL OR p.id = ANY($2::text[]))`,
    [tournamentId, playerIds],
  )).rows;
  const out = {};
  for (const r of rows) {
    const spaded = Array.isArray(r.spaded_units) ? new Set(r.spaded_units) : null;
    out[r.id] = {
      linked: Boolean(r.statshark_id),
      has: spaded ? spadedNames(vehicles, spaded) : null,
      fetched_at: r.spaded_fetched_at,
      error: r.spaded_error,
    };
  }
  return out;
}

/** Names of the pool vehicles to leave out of a match (shared spadedExcluded). */
export async function matchExcluded(db, tournamentId, vehicles, player1, player2) {
  if (!player1 || !player2) return [];
  const data = await eventSpaded(db, tournamentId, vehicles, [player1, player2]);
  return spadedExcluded(vehicles, data[player1]?.has ?? null, data[player2]?.has ?? null);
}
