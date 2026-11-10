// Routes for the QQ bots (apps/bot), behind BOT_TOKEN (lib/bot-auth.js),
// and the site side of binding a QQ account to a player.
//
// Community bot: GET /bot/notices -> post each in the group -> POST
// /bot/notices/:id/sent (lib/bot-notices.js queues them).
// Official bot: a player gets a code on the site (POST
// /players/:id/qq-bind-code, 10 minutes) and sends "绑定 <code>" to the bot,
// which calls POST /bot/bind with the openid QQ gave it for that person;
// afterwards GET /bot/whois/:openid tells the bot who is asking and GET
// /bot/players/:id/schedule what that player has coming up.

import { randomInt } from 'crypto';
import { requireBot } from '../lib/bot-auth.js';
import { BIND_MESSAGES, pendingNotices } from '../lib/bot-notices.js';
import { requireSelfOrAdmin } from '../lib/admin.js';
import { attentionItems } from '../lib/attention.js';
import { getPlayerDisplayName } from '../repositories/player-repo.js';

export const BIND_CODE_TTL_MINUTES = 10;
const OPENID = /^[A-Za-z0-9_-]{8,128}$/;

function openidOf(fastify, value) {
  const openid = String(value || '').trim();
  if (!OPENID.test(openid)) throw fastify.httpErrors.badRequest('openid is missing or malformed');
  return openid;
}

export default async function botRoutes(fastify) {
  fastify.get('/bot/notices', async (req) => {
    requireBot(fastify, req);
    return { data: await pendingNotices(fastify.db) };
  });

  fastify.post('/bot/notices/:id/sent', async (req) => {
    requireBot(fastify, req);
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw fastify.httpErrors.badRequest('Bad notice id');
    await fastify.db.query('UPDATE axsuck.bot_notices SET sent_at = NOW() WHERE id = $1 AND sent_at IS NULL', [id]);
    return { data: { id } };
  });

  // ---- Binding: the site side ----

  fastify.post('/players/:id/qq-bind-code', async (req) => {
    const playerId = String(req.params.id);
    await requireSelfOrAdmin(fastify, req, playerId);
    const exists = await fastify.db.query('SELECT id FROM axsuck.players WHERE id = $1', [playerId]);
    if (!exists.rows.length) throw fastify.httpErrors.notFound('Player not found');
    await fastify.db.query(
      'DELETE FROM axsuck.qq_bind_codes WHERE player_id = $1 OR expires_at < NOW()', [playerId],
    );
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const { rows } = await fastify.db.query(`
        INSERT INTO axsuck.qq_bind_codes (code, player_id, expires_at)
        VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 minute'))
        ON CONFLICT (code) DO NOTHING
        RETURNING code, expires_at
      `, [code, playerId, BIND_CODE_TTL_MINUTES]);
      if (rows.length) return { data: { code: rows[0].code, expires_at: rows[0].expires_at } };
    }
    throw fastify.httpErrors.serviceUnavailable('Could not make a code, please try again');
  });

  fastify.get('/players/:id/qq-bindings', async (req, reply) => {
    const playerId = String(req.params.id);
    await requireSelfOrAdmin(fastify, req, playerId);
    const { rows } = await fastify.db.query(
      'SELECT bound_at FROM axsuck.qq_bindings WHERE player_id = $1 ORDER BY bound_at DESC', [playerId],
    );
    reply.header('Cache-Control', 'no-store');
    return { data: { count: rows.length, last_bound_at: rows[0]?.bound_at ?? null } };
  });

  fastify.delete('/players/:id/qq-bindings', async (req) => {
    const playerId = String(req.params.id);
    await requireSelfOrAdmin(fastify, req, playerId);
    await fastify.db.query('DELETE FROM axsuck.qq_bindings WHERE player_id = $1', [playerId]);
    await fastify.db.query('DELETE FROM axsuck.qq_bind_codes WHERE player_id = $1', [playerId]);
    return { data: { ok: true } };
  });

  // ---- Binding: the bot side ----

  fastify.post('/bot/bind', async (req) => {
    requireBot(fastify, req);
    const openid = openidOf(fastify, req.body?.openid);
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) throw fastify.httpErrors.badRequest(BIND_MESSAGES.badCode);
    const used = await fastify.db.query(
      'DELETE FROM axsuck.qq_bind_codes WHERE code = $1 AND expires_at > NOW() RETURNING player_id', [code],
    );
    const playerId = used.rows[0]?.player_id;
    if (!playerId) throw fastify.httpErrors.notFound(BIND_MESSAGES.unknownCode);
    await fastify.db.query(`
      INSERT INTO axsuck.qq_bindings (openid, player_id) VALUES ($1, $2)
      ON CONFLICT (openid) DO UPDATE SET player_id = EXCLUDED.player_id, bound_at = NOW()
    `, [openid, playerId]);
    return { data: { player_id: playerId } };
  });

  fastify.delete('/bot/bind/:openid', async (req) => {
    requireBot(fastify, req);
    const openid = openidOf(fastify, req.params.openid);
    const { rowCount } = await fastify.db.query('DELETE FROM axsuck.qq_bindings WHERE openid = $1', [openid]);
    return { data: { removed: rowCount } };
  });

  fastify.get('/bot/whois/:openid', async (req) => {
    requireBot(fastify, req);
    const openid = openidOf(fastify, req.params.openid);
    const { rows } = await fastify.db.query('SELECT player_id FROM axsuck.qq_bindings WHERE openid = $1', [openid]);
    if (!rows.length) throw fastify.httpErrors.notFound('Not bound');
    return { data: { player_id: rows[0].player_id } };
  });

  // What a player has coming up: their unfinished events, and what each of
  // their playable matches needs now (lib/attention.js kinds).
  fastify.get('/bot/players/:id/schedule', async (req) => {
    requireBot(fastify, req);
    const playerId = String(req.params.id);
    const events = (await fastify.db.query(`
      SELECT t.id, t.name, t.status, t.scheduled_time, t.checkin_enabled, tp.checked_in_at, tp.forfeited
      FROM axsuck.tournament_players tp
      JOIN axsuck.tournaments t ON t.id = tp.tournament_id
      WHERE tp.player_id = $1 AND t.status <> 'completed'
      ORDER BY t.scheduled_time, t.id
    `, [playerId])).rows;
    const running = events.filter((e) => e.status === 'in_progress').map((e) => e.id);
    const matches = running.length ? (await fastify.db.query(`
      SELECT id, tournament_id, player1_id, player2_id, status, pending_report, banpick
      FROM axsuck.matches
      WHERE tournament_id = ANY($2::text[]) AND status = 'pending'
        AND (player1_id = $1 OR player2_id = $1)
        AND player1_id IS NOT NULL AND player2_id IS NOT NULL
    `, [playerId, running])).rows : [];
    const others = [...new Set(matches.flatMap((m) => [m.player1_id, m.player2_id]).filter((id) => id !== playerId))];
    const names = new Map(others.length ? (await fastify.db.query(
      'SELECT id, battle_tags FROM axsuck.players WHERE id = ANY($1::text[])', [others],
    )).rows.map((p) => [p.id, getPlayerDisplayName(p) || p.id]) : []);
    return {
      data: {
        player_id: playerId,
        events: events.map((e) => ({
          id: e.id,
          name: e.name,
          status: e.status,
          scheduled_time: e.scheduled_time,
          checkin_enabled: Boolean(e.checkin_enabled),
          checked_in: Boolean(e.checked_in_at),
        })),
        now: attentionItems(playerId, { events, matches, names }).filter((i) => ['confirm', 'ban', 'ready'].includes(i.kind)),
      },
    };
  });
}
