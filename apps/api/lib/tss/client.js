// Reading War Thunder TSS tournaments (tss.warthunder.com). TSS has no
// public API; these are the requests its own tournament page makes to
// functions.php, which answer without signing in:
//   DetailTournament        GET   settings, teams, rewards, round times
//   GetArrayBracketData     POST  single / double elimination bracket
//   GetArraySwissData       POST  Swiss standings and rounds (id_group)
//   GetArrayGroupData       POST  round-robin groups (id_group)
//   infoTeam                POST  a team's players (and the vehicle class)
//   getInfoMatch            GET   one match: its scheduled time
// Answers are cached briefly (an export makes up to a few hundred requests
// for a large event) and a finished event's answers for longer.

const DEFAULT_BASE = 'https://tss.warthunder.com';
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 6;
const TTL_LIVE_MS = 60_000;
const TTL_PAST_MS = 30 * 60_000;
const CACHE_MAX = 2000;

/** Thrown when TSS cannot be reached or answers with something unreadable. */
export class TssError extends Error {
  constructor(message, { code = 'TSS_UNREACHABLE', cause } = {}) {
    super(message, { cause });
    this.code = code;
  }
}

/** Runs `fn` over `items`, at most `limit` at a time; failures become null. */
export async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i).catch(() => null);
    }
  });
  await Promise.all(workers);
  return out;
}

const parseMaybe = (v) => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

/**
 * A TSS client. `fetch` and `base` can be replaced (tests, a mirror);
 * `TSS_URL` in the environment changes the default site.
 */
export function createTssClient({ fetch: fetchImpl = globalThis.fetch, base = process.env.TSS_URL || DEFAULT_BASE, now = () => Date.now() } = {}) {
  const cache = new Map(); // key -> { at, ttl, value }
  const root = String(base).replace(/\/+$/, '');

  async function call(method, params, ttl = TTL_LIVE_MS) {
    const query = new URLSearchParams(params).toString();
    const key = `${method} ${query}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < hit.ttl) return hit.value;
    let res;
    try {
      res = await fetchImpl(method === 'GET' ? `${root}/functions.php?${query}` : `${root}/functions.php`, {
        method,
        headers: {
          accept: 'application/json, text/javascript, */*',
          'user-agent': 'PotatoCup-TSS-Export/1.0 (+liquipedia wiki export)',
          ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: method === 'POST' ? query : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new TssError('无法连接 TSS（tss.warthunder.com），请稍后再试', { cause: err });
    }
    if (!res.ok) throw new TssError(`TSS 返回了错误（HTTP ${res.status}）`);
    const text = await res.text();
    let value;
    try {
      value = JSON.parse(text);
    } catch (err) {
      throw new TssError('TSS 返回的内容无法读取', { code: 'TSS_BAD_RESPONSE', cause: err });
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: now(), ttl, value });
    return value;
  }

  return {
    detail: (id, ttl) => call('GET', { id, action: 'DetailTournament' }, ttl),
    bracket: (id, ttl) => call('POST', { tournamentID: id, action: 'GetArrayBracketData' }, ttl),
    swiss: (id, group, ttl) => call('POST', { tournamentID: id, action: 'GetArraySwissData', id_group: group }, ttl),
    groups: (id, group, ttl) => call('POST', { tournamentID: id, action: 'GetArrayGroupData', id_group: group }, ttl),
    team: (id, teamId, ttl) => call('POST', { tournamentID: id, teamID: teamId, action: 'infoTeam' }, ttl),
    match: (id, matchId, type, ttl) => call('GET', { tournamentID: id, idMatch: matchId, action: 'getInfoMatch', typeMatch: type || '' }, ttl),
    clear: () => cache.clear(),
  };
}

const ttlOf = (data) => (data.detail.tournamentStatus === 'past' ? TTL_PAST_MS : TTL_LIVE_MS);

/**
 * Everything the export needs about one tournament: the TSS detail, its
 * bracket and/or Swiss / group stage, and the vehicle class (asked from one
 * team's page). Rosters and match times are added by loadRosters /
 * loadMatchTimes once the export knows which it needs. Throws TssError
 * (code TSS_NOT_FOUND) when TSS has no such tournament.
 */
export async function loadTournament(client, id) {
  const detail = await client.detail(id);
  if (!detail || typeof detail !== 'object' || !detail.tournamentID) {
    throw new TssError(`TSS 上没有找到比赛 ${id}`, { code: 'TSS_NOT_FOUND' });
  }
  const type = detail.typeTournament;
  const data = {
    id: Number(id),
    detail: {
      ...detail,
      rewards: parseMaybe(detail.rewards),
      allLocations: parseMaybe(detail.allLocations),
      listTeams: parseMaybe(detail.listTeams),
    },
    bracket: null,
    swiss: [],
    groups: [],
    rosters: {},
    statGroup: '',
    mtimes: {},
  };
  const ttl = ttlOf(data);
  const br = await client.bracket(id, ttl).catch(() => null);
  if (br?.status === 'OK' && br.data?.bracket) data.bracket = br.data.bracket;
  if (type === 'swiss' || Number(detail.groupType) > 0 || Number(detail.teamInGroup) > 0) {
    for (let g = 1; g <= 32; g += 1) {
      const r = await (type === 'swiss' ? client.swiss(id, g, ttl) : client.groups(id, g, ttl)).catch(() => null);
      if (r?.status !== 'OK' || !r.data?.GroupStage?.length) break;
      (type === 'swiss' ? data.swiss : data.groups).push(r.data);
      if (type === 'swiss') break; // one answer holds every round
    }
  }
  const first = (Array.isArray(data.detail.listTeams) ? data.detail.listTeams : [])[0];
  if (first?.idTeam) {
    const r = await client.team(id, first.idTeam, ttl).catch(() => null);
    data.statGroup = r?.param_tournaments?.statisticGroup || '';
  }
  return data;
}

/** Adds the players of the given teams (data.rosters[teamId] = [{ nick, role }]). */
export async function loadRosters(client, data, teamIds) {
  const ids = [...new Set(teamIds.map(String))].filter((t) => !(t in data.rosters));
  const answers = await mapLimited(ids, CONCURRENCY, (tid) => client.team(data.id, tid, ttlOf(data)));
  answers.forEach((r, i) => {
    if (Array.isArray(r?.users_team)) data.rosters[ids[i]] = r.users_team.map((u) => ({ nick: u.nick, role: u.role }));
  });
}

/**
 * Adds each match's own scheduled time (data.mtimes[matchId]): `invite` is
 * the slot TSS shows, `start` the battle start a minute later. Matches of
 * one round can have different slots (staggered for broadcasts).
 */
export async function loadMatchTimes(client, data, matches, field = 'invite') {
  const todo = matches.filter((m) => m?.id && !(String(m.id) in data.mtimes));
  const infos = await mapLimited(todo, CONCURRENCY, (m) => client.match(data.id, m.id, m.typeBracket, ttlOf(data)));
  infos.forEach((r, i) => {
    const x = r?.data;
    const t = x && (field === 'start' ? x.timeStartMatch : x.timeInviteMatch);
    if (t) data.mtimes[String(todo[i].id)] = String(t);
  });
}
