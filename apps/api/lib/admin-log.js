// Admin operation log: every successful admin write (a request with the
// admin token) to a route listed in ACTIONS is stored in axsuck.admin_log
// with who (the x-player-id the admin's browser sent), what (an action code
// plus the request's fields, secrets dropped) and on which event / match.
// The website words each action (#lib/admin-log.js); GET /admin/log reads
// them (routes/admin-log.js). Busy match-day controls (the live match, the
// overlay, countdowns, live scores, Ban / Pick steps, bracket previews) are
// not logged.

import { getRequesterId, isAdminRequest } from './admin.js';

// "METHOD /route" -> action code. Routes without /api prefix.
export const ACTIONS = {
  'POST /tournaments': 'event.create',
  'DELETE /tournaments/:id': 'event.delete',
  'PATCH /tournaments/:id': 'event.settings',
  'POST /tournaments/:id/status': 'event.status',
  'POST /tournaments/:id/start': 'event.start',
  'POST /tournaments/:id/swiss-rounds': 'event.swiss_rounds',
  'POST /tournaments/:id/playoffs': 'event.playoffs_start',
  'DELETE /tournaments/:id/playoffs': 'event.playoffs_withdraw',
  'PUT /tournaments/:id/round-best-of': 'event.best_of',
  'POST /tournaments/:id/import': 'event.import',
  'PUT /tournaments/:id/wiki': 'event.wiki',
  'POST /tournaments/:id/seeds': 'seeds.manual',
  'POST /tournaments/:id/seeds/auto': 'seeds.auto',
  'POST /tournaments/:id/seeds/randomize': 'seeds.random',
  'POST /tournaments/:id/register': 'player.register',
  'DELETE /tournaments/:id/register': 'player.unregister',
  'POST /tournaments/:id/checkin': 'player.checkin',
  'DELETE /tournaments/:id/checkin': 'player.checkin_undo',
  'DELETE /tournaments/:id/matches': 'matches.clear',
  'POST /tournaments/:id/matches/manual': 'match.manual',
  'POST /tournaments/:id/matches/:matchId/result': 'match.result',
  'POST /tournaments/:id/matches/:matchId/score': 'match.score',
  'POST /tournaments/:id/matches/:matchId/walkover': 'match.walkover',
  'POST /tournaments/:id/matches/:matchId/rollback': 'match.rollback',
  'POST /tournaments/:id/matches/:matchId/report/confirm': 'match.report_confirm',
  'POST /tournaments/:id/matches/:matchId/report/dispute': 'match.report_dispute',
  'DELETE /tournaments/:id/matches/:matchId/report': 'match.report_clear',
  'POST /tournaments/:id/vote': 'vote.cast',
  'DELETE /tournaments/:id/vote': 'vote.withdraw',
  'DELETE /tournaments/:id/votes/past': 'vote.clear_past',
  'POST /players': 'player.save',
  'DELETE /players/:id': 'player.delete',
  'POST /players/:id/change-id': 'player.change_id',
  'POST /players/:id/merge': 'player.merge',
  'DELETE /players/:id/key': 'player.key_reset',
  'DELETE /players/:id/qq-bindings': 'player.qq_unbind',
  'POST /players/not-duplicates': 'player.not_duplicate',
  'POST /points-seasons/:season/end': 'points.season_end',
  'POST /points-seasons/:season/reopen': 'points.season_reopen',
  'PUT /points-seasons/current': 'points.season_current',
  'POST /vehicle-pools': 'pool.create',
  'PUT /vehicle-pools/:id': 'pool.update',
  'DELETE /vehicle-pools/:id': 'pool.delete',
  'PUT /admin/alert-players': 'admin.alert_players',
  'POST /admin/backups/run': 'admin.backup',
};

const SECRET = /token|secret|password|passwd|key$|^key|private|auth/i;
const MAX_TEXT = 300;
const MAX_ITEMS = 40;

/** The request body without secrets, long text cut, big lists shortened. */
export function cleanDetail(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  if (typeof value === 'string') return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (depth > 3) return null;
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => cleanDetail(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // "key" alone is the round key of round-best-of, not a secret.
      if (k !== 'key' && SECRET.test(k)) continue;
      // Vehicle pool contents are long; their count is enough.
      if (k === 'vehicles' && Array.isArray(v)) {
        out.vehicle_count = v.length;
        continue;
      }
      out[k] = cleanDetail(v, depth + 1);
    }
    return out;
  }
  return null;
}

/** The action code of a request, or null when it is not logged. */
export function actionOf(method, routeUrl) {
  const route = String(routeUrl || '').replace(/^\/api(?=\/)/, '');
  return ACTIONS[`${String(method).toUpperCase()} ${route}`] || null;
}

/**
 * Hooks for the app: preHandler notes the event and match as they were
 * (before a delete or a correction), onResponse stores the row when the
 * request succeeded. Logging never fails a request.
 */
export function registerAdminLog(fastify) {
  fastify.addHook('preHandler', async (req) => {
    const action = actionOf(req.method, req.routeOptions?.url);
    if (!action || !isAdminRequest(req)) return;
    const ctx = { action, tournamentId: null, tournamentName: null, match: null };
    const params = req.params || {};
    try {
      if (req.routeOptions.url.includes('/tournaments/:id')) {
        ctx.tournamentId = String(params.id);
        const t = await fastify.db.query('SELECT name FROM axsuck.tournaments WHERE id = $1', [ctx.tournamentId]);
        ctx.tournamentName = t.rows[0]?.name ?? null;
      }
      if (params.matchId) {
        const m = await fastify.db.query(
          `SELECT id, round, position, bracket, player1_id, player2_id, score1, score2, winner_id, status
           FROM axsuck.matches WHERE id = $1`,
          [Number(params.matchId)],
        );
        ctx.match = m.rows[0] || null;
      }
    } catch (err) {
      fastify.log.warn({ err }, 'admin log: context lookup failed');
    }
    req.adminLog = ctx;
  });

  // A new event's id comes back in the response.
  fastify.addHook('onSend', async (req, reply, payload) => {
    const ctx = req.adminLog;
    if (ctx?.action === 'event.create' && typeof payload === 'string') {
      try {
        ctx.tournamentId = JSON.parse(payload)?.id ?? null;
      } catch {
        // not JSON: leave it
      }
    }
    return payload;
  });

  fastify.addHook('onResponse', async (req, reply) => {
    const ctx = req.adminLog;
    if (!ctx || reply.statusCode >= 400) return;
    const params = req.params || {};
    const body = cleanDetail(req.body && typeof req.body === 'object' ? req.body : {});
    const detail = { ...body };
    if (params.id && !ctx.tournamentId) detail.target = String(params.id);
    if (params.season) detail.season = String(params.season);
    if (ctx.match) {
      const m = ctx.match;
      detail.match = {
        round: m.round,
        position: m.position,
        bracket: m.bracket,
        player1: m.player1_id,
        player2: m.player2_id,
        before: m.status === 'pending' ? null : { score1: m.score1, score2: m.score2, winner: m.winner_id, status: m.status },
      };
    }
    // A new event: its name is in the body.
    const name = ctx.tournamentName ?? (ctx.action === 'event.create' ? String(req.body?.name || '') || null : null);
    try {
      await fastify.db.query(
        `INSERT INTO axsuck.admin_log (actor, action, tournament_id, tournament_name, match_id, detail)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [getRequesterId(req) || null, ctx.action, ctx.tournamentId, name, ctx.match?.id ?? null, JSON.stringify(detail)],
      );
    } catch (err) {
      fastify.log.warn({ err, action: ctx.action }, 'admin log: write failed');
    }
  });
}
