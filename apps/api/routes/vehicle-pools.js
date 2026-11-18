// Vehicle pool templates used by Ban / Pick (lib/vehicle-pools.js). Everyone
// can read them; admins create, edit, copy and delete them. An event page
// reads only its own template (GET /tournaments/:id/vehicle-pool), with the
// wiki unit of each vehicle filled in (lib/wt-unit-index.js). A template also
// lists the 比赛地图 its events use (missions, migration 056). The event's
// read also carries each player's spaded vehicles in that pool (Statshark,
// lib/statshark.js) for Ban / Pick.

import { randomBytes } from 'crypto';
import { requireAdmin } from '../lib/admin.js';
import { GAME_MODES, VEHICLE_POOLS } from '../lib/tournament-config.js';
import { normalizeRules, normalizeTemplate, resolveTemplate } from '@potato-cup/shared/vehicle-pools.js';
import { withUnits } from '../lib/wt-unit-index.js';
import { eventSpaded, quotaLeft, statsharkConfig, syncEventSpaded } from '../lib/statshark.js';

const COLUMNS = 'id, name, event_type, game_modes, rules, sort_order, vehicles, missions, created_at, updated_at';
const FIELDS = ['name', 'event_type', 'game_modes', 'rules', 'sort_order', 'vehicles', 'missions'];
const options = { eventTypes: VEHICLE_POOLS, gameModes: GAME_MODES };

const shape = (row) => row && { ...row, rules: normalizeRules(row.rules), game_modes: row.game_modes || [], missions: row.missions || [] };

export default async function vehiclePoolRoutes(fastify) {
  const db = fastify.db;

  async function listTemplates() {
    const rows = (await db.query(`SELECT ${COLUMNS} FROM axsuck.vehicle_pools ORDER BY event_type, sort_order, name`)).rows;
    return rows.map(shape);
  }

  // A template's maps must exist (routes/missions.js).
  async function missionsProblem(ids) {
    if (!ids?.length) return null;
    const known = new Set((await db.query('SELECT id FROM axsuck.missions WHERE id = ANY($1)', [ids])).rows.map((r) => r.id));
    const missing = ids.filter((x) => !known.has(x));
    return missing.length ? `没有这个地图：${missing.join(', ')}` : null;
  }

  fastify.get('/vehicle-pools', async () => ({ templates: await listTemplates() }));

  // The template an event uses (or null), as resolveTemplate picks it.
  fastify.get('/tournaments/:id/vehicle-pool', async (req) => {
    const t = (await db.query(
      'SELECT vehicle_pool, game_mode, vehicle_template FROM axsuck.tournaments WHERE id = $1',
      [req.params.id],
    )).rows[0];
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const template = withUnits(resolveTemplate(await listTemplates(), t));
    const spaded = template ? await eventSpaded(db, req.params.id, template.vehicles || []) : {};
    return { template, spaded, statshark: statsharkConfig().enabled };
  });

  // Admins: fetch the event's players' spaded vehicles now (the start of an
  // event does it by itself), also those fetched lately, down to the last
  // request of the day.
  fastify.post('/tournaments/:id/spaded/refresh', async (req) => {
    requireAdmin(fastify, req);
    const cfg = statsharkConfig();
    if (!cfg.enabled) throw fastify.httpErrors.badRequest('服务器还没有配置 Statshark API（STATSHARK_API_KEY）');
    const exists = (await db.query('SELECT 1 FROM axsuck.tournaments WHERE id = $1', [req.params.id])).rows.length;
    if (!exists) throw fastify.httpErrors.notFound('Tournament not found');
    const result = await syncEventSpaded(db, req.params.id, { force: true, cfg, log: fastify.log });
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'spaded_updated' });
    return result;
  });

  // How many Statshark requests are left today (admins).
  fastify.get('/statshark/quota', async (req) => {
    requireAdmin(fastify, req);
    const cfg = statsharkConfig();
    return { enabled: cfg.enabled, limit: cfg.dailyLimit, left: cfg.enabled ? await quotaLeft(db, cfg) : null };
  });

  fastify.post('/vehicle-pools', async (req) => {
    requireAdmin(fastify, req);
    const { template, error } = normalizeTemplate(req.body, options);
    if (error) throw fastify.httpErrors.badRequest(error);
    const missing = await missionsProblem(template.missions);
    if (missing) throw fastify.httpErrors.badRequest(missing);
    const id = `pool-${randomBytes(4).toString('hex')}`;
    const row = (await db.query(`
      INSERT INTO axsuck.vehicle_pools (id, name, event_type, game_modes, rules, sort_order, vehicles, missions, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, NOW())
      RETURNING ${COLUMNS}
    `, [id, template.name, template.event_type, template.game_modes, JSON.stringify(template.rules), template.sort_order, JSON.stringify(template.vehicles), template.missions])).rows[0];
    return shape(row);
  });

  fastify.put('/vehicle-pools/:id', async (req) => {
    requireAdmin(fastify, req);
    const { template, error } = normalizeTemplate(req.body, { ...options, partial: true });
    if (error) throw fastify.httpErrors.badRequest(error);
    const missing = await missionsProblem(template.missions);
    if (missing) throw fastify.httpErrors.badRequest(missing);
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
