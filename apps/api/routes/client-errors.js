// Front-end error reports: browsers POST uncaught errors (anyone; rate
// limited like other writes), admins read and clear them (/errors page).

import { requireAdmin, getRequesterId } from '../lib/admin.js';
import { cleanClientError, fingerprint, KEEP_CLIENT_ERRORS } from '../lib/client-errors.js';

export default async function clientErrorRoutes(fastify) {
  const db = fastify.db;

  fastify.post('/client-errors', async (req, reply) => {
    const { report, error } = cleanClientError(req.body || {});
    if (error) throw fastify.httpErrors.badRequest(error);
    const player = getRequesterId(req) || null;
    await db.query(
      `INSERT INTO axsuck.client_errors (fingerprint, message, stack, page, user_agent, player_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (fingerprint) DO UPDATE SET
         count = axsuck.client_errors.count + 1,
         last_at = NOW(),
         page = EXCLUDED.page,
         user_agent = EXCLUDED.user_agent,
         player_id = COALESCE(EXCLUDED.player_id, axsuck.client_errors.player_id)`,
      [fingerprint(report), report.message, report.stack, report.page, report.userAgent, player],
    );
    // Keep the newest rows only (cheap: the table is small).
    await db.query(
      `DELETE FROM axsuck.client_errors WHERE id IN (
         SELECT id FROM axsuck.client_errors ORDER BY last_at DESC OFFSET $1
       )`,
      [KEEP_CLIENT_ERRORS],
    );
    fastify.log.warn({ clientError: report.message, page: report.page }, 'client error');
    reply.code(204);
    return null;
  });

  fastify.get('/client-errors', async (req) => {
    requireAdmin(fastify, req);
    const limit = Math.min(500, Math.max(1, Number(req.query?.limit) || 200));
    const { rows } = await db.query(
      `SELECT id, message, stack, page, user_agent, player_id, count, first_at, last_at
       FROM axsuck.client_errors ORDER BY last_at DESC LIMIT $1`,
      [limit],
    );
    return { errors: rows };
  });

  fastify.delete('/client-errors', async (req) => {
    requireAdmin(fastify, req);
    await db.query('DELETE FROM axsuck.client_errors');
    return { success: true };
  });
}
