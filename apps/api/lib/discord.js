// Discord announcements through a webhook an admin sets (site_settings key
// 'discord'): registration open, the event started, every result, the
// champion. Messages are built by pure functions (tested); sending never
// fails or slows the request that triggered it.

export const DISCORD_EVENTS = ['registration', 'start', 'result', 'champion'];
const SETTINGS_KEY = 'discord';

/** Settings with defaults: { webhook_url, site_url, events: { registration, start, result, champion } }. */
export function normalizeDiscordSettings(raw = {}) {
  const events = {};
  for (const e of DISCORD_EVENTS) events[e] = raw?.events?.[e] !== false;
  return {
    webhook_url: String(raw?.webhook_url || '').trim(),
    site_url: String(raw?.site_url || '').trim().replace(/\/+$/, ''),
    events,
  };
}

/** Problem with a webhook / site address, or null. Any https URL is allowed (a relay, too). */
export function discordSettingsProblem({ webhook_url, site_url }) {
  if (webhook_url && !/^https:\/\/[^\s/]+\/\S+$/i.test(webhook_url)) return 'Webhook 地址必须以 https:// 开头';
  if (site_url && !/^https?:\/\/[^\s/]+/i.test(site_url)) return '网站地址必须以 http:// 或 https:// 开头';
  return null;
}

/** "https://disc…/api/webhooks/123/ab…yz" for showing a stored address. */
export function maskWebhook(url) {
  if (!url) return '';
  const m = String(url).match(/^(https:\/\/[^/]+\/)(.*)$/);
  if (!m) return '…';
  const rest = m[2];
  return `${m[1]}${rest.length > 12 ? `${rest.slice(0, 6)}…${rest.slice(-4)}` : '…'}`;
}

const link = (site, t) => (site ? `${site}/tournament/${encodeURIComponent(t.id)}` : '');
const withLink = (text, url) => (url ? `${text}\n${url}` : text);

/** Message for one kind of announcement; `data` depends on the kind. */
export function discordMessage(kind, t, data = {}, siteUrl = '') {
  if (kind === 'test') return { content: '✅ Potato Cup 赛事平台：Discord 播报测试消息' };
  if (!t) return null;
  const url = link(siteUrl, t);
  const name = `**${t.name}**`;
  if (kind === 'registration') {
    const when = t.scheduled_time ? `，比赛时间（北京时间）${t.scheduled_time.replace('T', ' ')}` : '';
    return { content: withLink(`📝 ${name} 开放报名${when}`, url) };
  }
  if (kind === 'start') {
    const extra = data.players ? `，${data.players} 名选手` : '';
    return { content: withLink(`⚔️ ${name} 对阵已生成，比赛开始${extra}`, url) };
  }
  if (kind === 'result') {
    const { player1, player2, score1, score2, walkover, winner, round } = data;
    const line = walkover
      ? `${winner} 对手弃权胜（${winner === player1 ? player2 : player1}）`
      : `${player1} **${score1} : ${score2}** ${player2}`;
    return { content: `🎮 ${name}${round ? ` · ${round}` : ''}：${line}` };
  }
  if (kind === 'champion') {
    const medals = ['🥇', '🥈', '🥉'];
    const podium = (data.podium || []).slice(0, 3).map((names, i) => `${medals[i]} ${names.join(' / ')}`).join('\n');
    return { content: withLink(`🏆 ${name} 结束！冠军：**${data.champion}**${podium ? `\n${podium}` : ''}`, url) };
  }
  return null;
}

export async function loadDiscordSettings(db) {
  const res = await db.query('SELECT value FROM axsuck.site_settings WHERE key = $1', [SETTINGS_KEY]);
  return normalizeDiscordSettings(res.rows[0]?.value);
}

export async function saveDiscordSettings(db, settings) {
  const value = normalizeDiscordSettings(settings);
  await db.query(`
    INSERT INTO axsuck.site_settings (key, value) VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `, [SETTINGS_KEY, JSON.stringify(value)]);
  return value;
}

/** Posts a message; resolves to { ok, status?, error? } and never throws. */
export async function postWebhook(url, message, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...message, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e.cause?.code || e.name || e.message };
  }
}

/** Announces in the background when a webhook is set and the kind is on. */
export function announce(fastify, kind, t, data = {}) {
  (async () => {
    const settings = await loadDiscordSettings(fastify.db);
    if (!settings.webhook_url || !settings.events[kind]) return;
    const message = discordMessage(kind, t, data, settings.site_url);
    if (!message) return;
    const res = await postWebhook(settings.webhook_url, message);
    if (!res.ok) fastify.log?.warn({ kind, tournament: t.id, error: res.error }, 'discord announcement failed');
  })().catch((err) => fastify.log?.error({ err }, 'discord announcement failed'));
}

/** Round name for a result message: 决赛, 半决赛, 胜者组第 2 轮, 瑞士轮第 3 轮... */
export function roundName(match, mainRounds = 1) {
  const r = match.round;
  if (match.bracket === 'sw') return `瑞士轮第 ${r} 轮`;
  if (match.bracket === 'gf') return match.position === 2 ? '总决赛重置赛' : '总决赛';
  if (match.bracket === 'wb') return `胜者组第 ${r} 轮`;
  if (match.bracket === 'lb') return `败者组第 ${r} 轮`;
  if (['gse', 'gwb', 'glb'].includes(match.bracket)) return '小组赛';
  if (r === 0) return '三四名决赛';
  if (r === 1) return '决赛';
  if (r === 2) return '半决赛';
  if (r === 3 && mainRounds >= 3) return '四分之一决赛';
  return `第 ${Math.max(1, mainRounds - r + 1)} 轮`;
}

const displayName = (p) => p?.id || '';

/** Announces a match result (scores or walkover). */
export function announceResult(fastify, tournamentId, matchId) {
  (async () => {
    const settings = await loadDiscordSettings(fastify.db);
    if (!settings.webhook_url || !settings.events.result) return;
    const [t] = (await fastify.db.query('SELECT id, name FROM axsuck.tournaments WHERE id = $1', [tournamentId])).rows;
    const [m] = (await fastify.db.query('SELECT * FROM axsuck.matches WHERE id = $1', [matchId])).rows;
    if (!t || !m || (m.status !== 'completed' && m.status !== 'walkover') || !m.player1_id || !m.player2_id) return;
    const [{ max } = {}] = (await fastify.db.query(
      "SELECT MAX(round)::int AS max FROM axsuck.matches WHERE tournament_id = $1 AND bracket = 'main'", [tournamentId],
    )).rows;
    const message = discordMessage('result', t, {
      player1: displayName({ id: m.player1_id }),
      player2: displayName({ id: m.player2_id }),
      score1: m.score1,
      score2: m.score2,
      walkover: m.status === 'walkover',
      winner: m.winner_id,
      round: roundName(m, max || 1),
    }, settings.site_url);
    const res = await postWebhook(settings.webhook_url, message);
    if (!res.ok) fastify.log?.warn({ tournament: tournamentId, matchId, error: res.error }, 'discord result failed');
  })().catch((err) => fastify.log?.error({ err }, 'discord result failed'));
}

/** Podium as names per place: [[champion], [second], [third, third]] from placements. */
export function podiumFrom(places) {
  const byPlace = new Map();
  for (const [id, place] of places) {
    if (place.from > 3) continue;
    if (!byPlace.has(place.from)) byPlace.set(place.from, []);
    byPlace.get(place.from).push(id);
  }
  return [...byPlace.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => ids.sort());
}
