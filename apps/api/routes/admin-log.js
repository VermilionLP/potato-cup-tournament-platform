// Admins read the operation log (lib/admin-log.js): newest first, for one
// event (?tournament=) or everything, a page at a time (?before=<id>).

import { requireAdmin } from '../lib/admin.js';

export const LOG_PAGE = 100;

export default async function adminLogRoutes(fastify) {
  fastify.get('/admin/log', async (req) => {
    requireAdmin(fastify, req);
    const tournament = String(req.query?.tournament || '').trim() || null;
    const before = Number(req.query?.before) || null;
    const limit = Math.min(LOG_PAGE, Math.max(1, Number(req.query?.limit) || LOG_PAGE));
    const { rows } = await fastify.db.query(
      `SELECT id, at, actor, action, tournament_id, tournament_name, match_id, detail
       FROM axsuck.admin_log
       WHERE ($1::text IS NULL OR tournament_id = $1) AND ($2::bigint IS NULL OR id < $2)
       ORDER BY id DESC LIMIT $3`,
      [tournament, before, limit + 1],
    );
    return { entries: rows.slice(0, limit), more: rows.length > limit };
  });
}
