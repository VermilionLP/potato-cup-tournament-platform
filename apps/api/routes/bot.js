// Routes for the QQ bots (apps/bot), behind BOT_TOKEN (lib/bot-auth.js),
// and the site side of binding a QQ account to a player.
//
// Community bot: GET /bot/notices (messages, each with the ids of the
// notices it carries) -> post each in the group -> POST /bot/notices/sent
// {ids} (lib/bot-notices.js queues, orders and merges them).
// Official bot: a player gets a code on the site (POST
// /players/:id/qq-bind-code, 10 minutes) and sends "绑定 <code>" to the bot,
// which calls POST /bot/bind with the openid QQ gave it for that person;
// afterwards GET /bot/whois/:openid tells the bot who is asking and GET
// /bot/players/:id/schedule what that player has coming up.
// Registration: the bot acts only for the player bound to the openid it
// passes (POST /bot/register, /bot/unregister, /bot/checkin), with the same
// rules as the site (lib/registration.js); GET /bot/open-events lists the
// events taking sign-ups, in the order the bot numbers them.
// Results: POST /bot/report (the bound player's score, theirs first),
// /bot/confirm and /bot/dispute (the opponent's answer), with the site's
// rules (lib/player-reports.js, lib/match-reports.js).
// A binding code works for two openids (a group and a private chat: QQ
// gives a person a different openid in each) within its 10 minutes.

import { randomInt } from 'crypto';
import { requireBot } from '../lib/bot-auth.js';
import { BIND_MESSAGES, REGISTER_MESSAGES, RESULT_MESSAGES, pendingNotices } from '../lib/bot-notices.js';
import { checkinState } from '../lib/checkin.js';
import { registerPlayer, setCheckin, unregisterPlayer } from '../lib/registration.js';
import { confirmReport, disputeReport, rejectGroupEditDuringPlayoffs, requireOpenMatch, submitReport } from '../lib/player-reports.js';
import { canConfirm, canDispute, scoreProblem } from '../lib/match-reports.js';
import { MatchRepo } from '../repositories/match-repo.js';
import { requireSelfOrAdmin } from '../lib/admin.js';
import { attentionItems } from '../lib/attention.js';
import { getPlayerDisplayName } from '../repositories/player-repo.js';

export const BIND_CODE_TTL_MINUTES = 10;
// One code binds a group and a private chat (different openids).
export const BIND_CODE_USES = 2;

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

  fastify.post('/bot/notices/sent', async (req) => {
    requireBot(fastify, req);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
    if (!ids.length || ids.length > 100 || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) throw fastify.httpErrors.badRequest('Bad notice ids');
    await fastify.db.query('UPDATE axsuck.bot_notices SET sent_at = NOW() WHERE id = ANY($1::bigint[]) AND sent_at IS NULL', [ids]);
    return { data: { ids } };
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
      'UPDATE axsuck.qq_bind_codes SET uses = uses + 1 WHERE code = $1 AND expires_at > NOW() AND uses < $2 RETURNING player_id',
      [code, BIND_CODE_USES],
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

  // ---- Results ----

  // The bound player's open matches (both players known, in running events),
  // with names for the replies.
  async function openMatchesOf(playerId) {
    const { rows } = await fastify.db.query(`
      SELECT m.*, t.name AS tournament_name
      FROM axsuck.matches m
      JOIN axsuck.tournaments t ON t.id = m.tournament_id
      WHERE t.status = 'in_progress' AND m.status = 'pending'
        AND (m.player1_id = $1 OR m.player2_id = $1)
        AND m.player1_id IS NOT NULL AND m.player2_id IS NOT NULL AND m.player1_id <> m.player2_id
      ORDER BY t.scheduled_time, m.id
    `, [playerId]);
    const ids = [...new Set(rows.flatMap((m) => [m.player1_id, m.player2_id]))];
    const names = new Map(ids.length ? (await fastify.db.query(
      'SELECT id, battle_tags FROM axsuck.players WHERE id = ANY($1::text[])', [ids],
    )).rows.map((p) => [p.id, getPlayerDisplayName(p) || p.id]) : []);
    return rows.map((m) => ({ ...m, names }));
  }
  const nameOf = (m, id) => m.names.get(id) || id;
  // A match as the bot words it: the asking player first.
  const view = (m, me, extra = {}) => {
    const first = m.player1_id === me;
    const opp = first ? m.player2_id : m.player1_id;
    const r = m.pending_report;
    return {
      match_id: m.id,
      tournament_id: m.tournament_id,
      tournament: m.tournament_name,
      me: nameOf(m, me),
      opponent: nameOf(m, opp),
      report: r ? {
        kind: r.kind,
        mine: r.kind === 'score' ? (first ? r.score1 : r.score2) : null,
        theirs: r.kind === 'score' ? (first ? r.score2 : r.score1) : null,
        by_me: r.by === me,
        disputed: Boolean(r.disputed),
      } : null,
      ...extra,
    };
  };
  const notFoundMatch = (msg) => {
    const err = fastify.httpErrors.notFound(msg);
    err.code = 'NO_MATCH';
    return err;
  };
  // With several open matches, one has to be picked (by event name or id).
  function pickMatch(list, tournament, what) {
    if (!list.length) throw notFoundMatch(what);
    if (tournament) {
      const q = String(tournament).trim().toLowerCase();
      const hit = list.filter((m) => m.tournament_id === tournament || String(m.tournament_name).toLowerCase().includes(q));
      if (hit.length === 1) return hit[0];
    }
    if (list.length === 1) return list[0];
    const err = fastify.httpErrors.conflict(RESULT_MESSAGES.several(list.map((m) => m.tournament_name)));
    err.code = 'SEVERAL';
    throw err;
  }

  // "报分 2:1": the bound player's own score first.
  fastify.post('/bot/report', async (req) => {
    requireBot(fastify, req);
    const playerId = await boundPlayer(openidOf(fastify, req.body?.openid));
    const mine = Number(req.body?.mine);
    const theirs = Number(req.body?.theirs);
    const problem = scoreProblem(mine, theirs);
    if (problem) throw fastify.httpErrors.badRequest(problem);
    const m = pickMatch(await openMatchesOf(playerId), req.body?.tournament_id, RESULT_MESSAGES.noMatch);
    requireOpenMatch(fastify, m);
    await rejectGroupEditDuringPlayoffs(fastify, m);
    const first = m.player1_id === playerId;
    const out = await submitReport(fastify, m.tournament_id, m, playerId, { kind: 'score', score1: first ? mine : theirs, score2: first ? theirs : mine });
    return { data: view(m, playerId, { result: out.report, mine, theirs }) };
  });

  // The opponent's answer to a pending score: confirm it or dispute it.
  async function answer(req, action) {
    requireBot(fastify, req);
    const playerId = await boundPlayer(openidOf(fastify, req.body?.openid));
    const allowed = action === 'confirm' ? canConfirm : canDispute;
    const list = (await openMatchesOf(playerId)).filter((m) => allowed(m, playerId));
    const m = pickMatch(list, req.body?.tournament_id, action === 'confirm' ? RESULT_MESSAGES.nothingToConfirm : RESULT_MESSAGES.nothingToDispute);
    if (action === 'confirm') await confirmReport(fastify, m.tournament_id, m, { by: playerId });
    else await disputeReport(fastify, m.tournament_id, m, { by: playerId });
    const after = await MatchRepo(fastify.db).getById(m.id);
    return { data: view(m, playerId, { result: action === 'confirm' ? 'confirmed' : 'disputed', status: after?.status || null }) };
  }
  fastify.post('/bot/confirm', (req) => answer(req, 'confirm'));
  fastify.post('/bot/dispute', (req) => answer(req, 'dispute'));
}
