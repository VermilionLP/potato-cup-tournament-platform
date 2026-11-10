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
// Registration: the bot acts only for the player bound to the openid it
// passes (POST /bot/register, /bot/unregister, /bot/checkin), with the same
// rules as the site (lib/registration.js); GET /bot/open-events lists the
// events taking sign-ups, in the order the bot numbers them.

import { randomInt } from 'crypto';
import { requireBot } from '../lib/bot-auth.js';
import { BIND_MESSAGES, REGISTER_MESSAGES, pendingNotices } from '../lib/bot-notices.js';
import { checkinState } from '../lib/checkin.js';
import { registerPlayer, setCheckin, unregisterPlayer } from '../lib/registration.js';
import { requireSelfOrAdmin } from '../lib/admin.js';
import { attentionItems } from '../lib/attention.js';
import { getPlayerDisplayName } from '../repositories/player-repo.js';

export const BIND_CODE_TTL_MINUTES = 10;

// What the bot's cards show as an event's tags (as the site's event list:
// tier and kind, mode, vehicle pool, format).
const eventTags = (t) => ({
  game_mode: t.game_mode || null,
  format: t.format || null,
  two_stage: Boolean(t.playoff_format),
  vehicle_pool: t.vehicle_pool || null,
  tier: t.tier || null,
  event_kind: t.event_kind || null,
});
const OPENID = /^[A-Za-z0-9_-]{8,128}$/;

function openidOf(fastify, value) {
  const openid = String(value || '').trim();
  if (!OPENID.test(openid)) throw fastify.httpErrors.badRequest('openid is missing or malformed');
  return openid;
}

export default async function botRoutes(fastify) {
  // The player bound to this openid, or 403 with code NOT_BOUND.
  async function boundPlayer(openid) {
    const { rows } = await fastify.db.query('SELECT player_id FROM axsuck.qq_bindings WHERE openid = $1', [openid]);
    if (rows.length) return rows[0].player_id;
    const err = fastify.httpErrors.forbidden(REGISTER_MESSAGES.notBound);
    err.code = 'NOT_BOUND';
    throw err;
  }
  const eventId = (value) => {
    const id = String(value || '').trim();
    if (!id) throw fastify.httpErrors.badRequest('tournament_id is required');
    return id;
  };

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
      SELECT t.id, t.name, t.status, t.scheduled_time, t.checkin_enabled, tp.checked_in_at, tp.forfeited,
             t.game_mode, t.format, t.playoff_format, t.vehicle_pool, t.tier, t.event_kind
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
          checkin_open: e.status === 'registration' && Boolean(e.checkin_enabled) && checkinState(e).open,
          checked_in: Boolean(e.checked_in_at),
          ...eventTags(e),
        })),
        now: attentionItems(playerId, { events, matches, names }).filter((i) => ['confirm', 'ban', 'ready'].includes(i.kind)),
      },
    };
  });

  // Events taking sign-ups, soonest first; with ?openid= also whether the
  // bound player is in each and checked in.
  fastify.get('/bot/open-events', async (req) => {
    requireBot(fastify, req);
    const openid = req.query?.openid ? openidOf(fastify, req.query.openid) : null;
    const bound = openid
      ? (await fastify.db.query('SELECT player_id FROM axsuck.qq_bindings WHERE openid = $1', [openid])).rows[0]?.player_id ?? null
      : null;
    const { rows } = await fastify.db.query(`
      SELECT t.id, t.name, t.scheduled_time, t.player_capacity, t.checkin_enabled, t.status,
             t.game_mode, t.format, t.playoff_format, t.vehicle_pool, t.tier, t.event_kind,
             (SELECT COUNT(*)::int FROM axsuck.tournament_players p WHERE p.tournament_id = t.id) AS player_count,
             me.player_id IS NOT NULL AS registered, me.checked_in_at
      FROM axsuck.tournaments t
      LEFT JOIN axsuck.tournament_players me ON me.tournament_id = t.id AND me.player_id = $1
      WHERE t.status = 'registration'
      ORDER BY NULLIF(t.scheduled_time, '') NULLS LAST, t.created_at, t.id
    `, [bound]);
    return {
      data: {
        player_id: bound,
        events: rows.map((t) => ({
          id: t.id,
          name: t.name,
          scheduled_time: t.scheduled_time,
          player_count: t.player_count,
          player_capacity: t.player_capacity,
          checkin_enabled: Boolean(t.checkin_enabled),
          checkin_open: checkinState(t).open,
          registered: Boolean(t.registered),
          checked_in: Boolean(t.checked_in_at),
          ...eventTags(t),
        })),
      },
    };
  });

  fastify.post('/bot/register', async (req) => {
    requireBot(fastify, req);
    const playerId = await boundPlayer(openidOf(fastify, req.body?.openid));
    const tournamentId = eventId(req.body?.tournament_id);
    const t = await registerPlayer(fastify, { tournamentId, playerId });
    return { data: { player_id: playerId, tournament_id: tournamentId, name: t.name, checkin_enabled: Boolean(t.checkin_enabled) } };
  });

  fastify.post('/bot/unregister', async (req) => {
    requireBot(fastify, req);
    const playerId = await boundPlayer(openidOf(fastify, req.body?.openid));
    const tournamentId = eventId(req.body?.tournament_id);
    const removed = await unregisterPlayer(fastify, { tournamentId, playerId, onlyOpen: true });
    return { data: { player_id: playerId, tournament_id: tournamentId, removed } };
  });

  // Checks the bound player in to one event, or (no tournament_id) to every
  // event of theirs whose check-in is open now.
  fastify.post('/bot/checkin', async (req) => {
    requireBot(fastify, req);
    const playerId = await boundPlayer(openidOf(fastify, req.body?.openid));
    let ids;
    if (req.body?.tournament_id) {
      ids = [eventId(req.body.tournament_id)];
    } else {
      const { rows } = await fastify.db.query(`
        SELECT t.id, t.status, t.scheduled_time, t.checkin_enabled FROM axsuck.tournament_players tp
        JOIN axsuck.tournaments t ON t.id = tp.tournament_id
        WHERE tp.player_id = $1 AND t.status = 'registration' AND t.checkin_enabled
      `, [playerId]);
      ids = rows.filter((t) => checkinState(t).open).map((t) => t.id);
    }
    const done = [];
    for (const tournamentId of ids) {
      await setCheckin(fastify, { tournamentId, playerId, checkedIn: true });
      done.push(tournamentId);
    }
    return { data: { player_id: playerId, checked_in: done } };
  });
}
