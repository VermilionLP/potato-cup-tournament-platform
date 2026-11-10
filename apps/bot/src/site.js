// Calls to the Potato Cup website API.

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
