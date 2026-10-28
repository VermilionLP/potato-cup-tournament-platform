// Vehicle pool templates used by Ban / Pick (lib/vehicle-pools.js). Everyone
// can read them; admins create, edit, copy and delete them.

import { randomBytes } from 'crypto';
import { requireAdmin } from '../lib/admin.js';
import { GAME_MODES, VEHICLE_POOLS } from '../lib/tournament-config.js';
import { normalizeRules, normalizeTemplate } from '../lib/vehicle-pools.js';

const COLUMNS = 'id, name, event_type, game_modes, rules, sort_order, vehicles, created_at, updated_at';
const FIELDS = ['name', 'event_type', 'game_modes', 'rules', 'sort_order', 'vehicles'];
const options = { eventTypes: VEHICLE_POOLS, gameModes: GAME_MODES };

const shape = (row) => row && { ...row, rules: normalizeRules(row.rules), game_modes: row.game_modes || [] };

export default async function vehiclePoolRoutes(fastify) {
  const db = fastify.db;

  async function listTemplates() {
    const rows = (await db.query(`SELECT ${COLUMNS} FROM axsuck.vehicle_pools ORDER BY event_type, sort_order, name`)).rows;
    return rows.map(shape);
  }

  fastify.get('/vehicle-pools', async () => ({ templates: await listTemplates() }));

  fastify.post('/vehicle-pools', async (req) => {
    requireAdmin(fastify, req);
    const { template, error } = normalizeTemplate(req.body, options);
    if (error) throw fastify.httpErrors.badRequest(error);
    const id = `pool-${randomBytes(4).toString('hex')}`;
    const row = (await db.query(`
      INSERT INTO axsuck.vehicle_pools (id, name, event_type, game_modes, rules, sort_order, vehicles, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, NOW())
      RETURNING ${COLUMNS}
    `, [id, template.name, template.event_type, template.game_modes, JSON.stringify(template.rules), template.sort_order, JSON.stringify(template.vehicles)])).rows[0];
    return shape(row);
  });

  fastify.put('/vehicle-pools/:id', async (req) => {
    requireAdmin(fastify, req);
    const { template, error } = normalizeTemplate(req.body, { ...options, partial: true });
    if (error) throw fastify.httpErrors.badRequest(error);
    const sets = [];
    const params = [req.params.id];
    for (const field of FIELDS) {
      if (template[field] === undefined) continue;
      const json = field === 'rules' || field === 'vehicles';
      params.push(json ? JSON.stringify(template[field]) : template[field]);
      sets.push(`${field} = $${params.length}${json ? '::jsonb' : ''}`);
    }
    if (!sets.length) throw fastify.httpErrors.badRequest('没有要修改的内容');
    const row = (await db.query(`
      UPDATE axsuck.vehicle_pools SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1 RETURNING ${COLUMNS}
    `, params)).rows[0];
    if (!row) throw fastify.httpErrors.notFound('载具池模板不存在');
    return shape(row);
  });

  // Events that had picked it go back to automatic choice (ON DELETE SET NULL).
  fastify.delete('/vehicle-pools/:id', async (req) => {
    requireAdmin(fastify, req);
    const res = await db.query('DELETE FROM axsuck.vehicle_pools WHERE id = $1', [req.params.id]);
    if (!res.rowCount) throw fastify.httpErrors.notFound('载具池模板不存在');
    return { id: req.params.id, deleted: true };
  });
}
