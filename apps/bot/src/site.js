// Calls to the Potato Cup website API. The bot routes (/api/bot/...) need
// BOT_TOKEN, the same value as in apps/api/.env.

/** { ok: true } when GET /api/ping answers, else { ok: false, error }. */
export async function pingSite(siteUrl, { timeoutMs = 5000, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${siteUrl}/api/ping`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.json();
    return body?.pong === true ? { ok: true } : { ok: false, error: 'unexpected reply' };
  } catch (err) {
    return { ok: false, error: err?.name === 'TimeoutError' ? 'timeout' : (err?.code || err?.message || 'error') };
  }
}

/** An error from the site; `status` is the HTTP status, `message` the site's own words. */
export class SiteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createSite({ siteUrl, botToken, timeoutMs = 8000, fetchImpl = fetch }) {
  async function call(method, path, body) {
    const headers = { 'x-bot-token': botToken };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetchImpl(`${siteUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new SiteError(res.status, json.message || json.error || `HTTP ${res.status}`);
    return json.data ?? json;
  }
  const enc = encodeURIComponent;
  return {
    notices: () => call('GET', '/bot/notices'),
    markSent: (id) => call('POST', `/bot/notices/${enc(id)}/sent`, {}),
    bind: (code, openid) => call('POST', '/bot/bind', { code, openid }),
    unbind: (openid) => call('DELETE', `/bot/bind/${enc(openid)}`),
    /** The bound player id, or null. */
    whois: async (openid) => {
      try {
        return (await call('GET', `/bot/whois/${enc(openid)}`)).player_id;
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },
    schedule: (playerId) => call('GET', `/bot/players/${enc(playerId)}/schedule`),
    statistics: () => call('GET', '/players/statistics'),
    /** League, MMR and games (newest first) from the ladder, or null without ladder games. */
    ladder: async (playerId) => {
      try {
        return await call('GET', `/ladder/players/${enc(playerId)}`);
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },
    openEvents: (openid) => call('GET', `/bot/open-events${openid ? `?openid=${enc(openid)}` : ''}`),
    register: (openid, tournamentId) => call('POST', '/bot/register', { openid, tournament_id: tournamentId }),
    unregister: (openid, tournamentId) => call('POST', '/bot/unregister', { openid, tournament_id: tournamentId }),
    /** Without a tournament: every event of theirs whose check-in is open. */
    checkin: (openid, tournamentId) => call('POST', '/bot/checkin', { openid, ...(tournamentId ? { tournament_id: tournamentId } : {}) }),
  };
}
