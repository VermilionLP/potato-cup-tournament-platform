// The /admin page: matches waiting for an admin (lib/admin-alerts.js), who
// is alerted, and database backups (lib/backup-status.js). Admins only.

import { requireAdmin } from '../lib/admin.js';
import { alertPlayers, loadPending, MAX_ALERT_PLAYERS, setAlertPlayers } from '../lib/admin-alerts.js';
import { backupNow, backupStatus, verifyBackup } from '../lib/backup-status.js';

export default async function adminSystemRoutes(fastify) {
  fastify.get('/admin/pending', async (req, reply) => {
    requireAdmin(fastify, req);
    reply.header('Cache-Control', 'no-store');
    return { items: await loadPending(fastify.db) };
  });

  fastify.get('/admin/alert-players', async (req) => {
    requireAdmin(fastify, req);
    return { players: await alertPlayers(fastify.db), max: MAX_ALERT_PLAYERS };
  });

  fastify.put('/admin/alert-players', async (req) => {
    requireAdmin(fastify, req);
    const ids = req.body?.players;
    if (!Array.isArray(ids)) throw fastify.httpErrors.badRequest('players must be a list of player IDs');
    const wanted = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
    if (wanted.length > MAX_ALERT_PLAYERS) throw fastify.httpErrors.badRequest(`最多提醒 ${MAX_ALERT_PLAYERS} 位管理员`);
    const known = new Set((await fastify.db.query('SELECT id FROM axsuck.players WHERE id = ANY($1::text[])', [wanted])).rows.map((r) => r.id));
    const missing = wanted.filter((id) => !known.has(id));
    if (missing.length) throw fastify.httpErrors.badRequest(`没有这个选手：${missing.join('、')}`);
    return { players: await setAlertPlayers(fastify.db, wanted) };
  });

  fastify.get('/admin/backups', async (req, reply) => {
    requireAdmin(fastify, req);
    reply.header('Cache-Control', 'no-store');
    return backupStatus();
  });

  fastify.post('/admin/backups/verify', async (req) => {
    requireAdmin(fastify, req);
    return verifyBackup(req.body?.file);
  });

  fastify.post('/admin/backups/run', async (req) => {
    requireAdmin(fastify, req);
    const result = await backupNow();
    return { ...result, status: await backupStatus() };
  });
}
