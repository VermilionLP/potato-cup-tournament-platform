// Vehicle pools used by Ban / Pick, one per event type. Everyone can read
// them; admins edit, import or reset them. Types without a saved pool use
// the pool bundled with the web app.

import { requireAdmin } from '../lib/admin.js';
import { VEHICLE_POOLS } from '../lib/tournament-config.js';
import { normalizeVehicles } from '../lib/vehicle-pools.js';

export default async function vehiclePoolRoutes(fastify) {
  const db = fastify.db;

  const poolId = (req) => {
    const id = String(req.params.id || '');
    if (!VEHICLE_POOLS.includes(id)) {
      throw fastify.httpErrors.notFound(`vehicle pool must be one of: ${VEHICLE_POOLS.join(', ')}`);
    }
    return id;
  };

  fastify.get('/vehicle-pools', async () => {
    const rows = (await db.query('SELECT id, vehicles, updated_at FROM axsuck.vehicle_pools')).rows;
    return { pools: Object.fromEntries(rows.map((r) => [r.id, { vehicles: r.vehicles, updated_at: r.updated_at }])) };
  });

  fastify.put('/vehicle-pools/:id', async (req) => {
    requireAdmin(fastify, req);
    const id = poolId(req);
    const { vehicles, error } = normalizeVehicles(req.body?.vehicles);
    if (error) throw fastify.httpErrors.badRequest(error);
    const row = (await db.query(`
      INSERT INTO axsuck.vehicle_pools (id, vehicles, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET vehicles = EXCLUDED.vehicles, updated_at = NOW()
      RETURNING id, vehicles, updated_at
    `, [id, JSON.stringify(vehicles)])).rows[0];
    return row;
  });

  // Back to the bundled default pool.
  fastify.delete('/vehicle-pools/:id', async (req) => {
    requireAdmin(fastify, req);
    const id = poolId(req);
    await db.query('DELETE FROM axsuck.vehicle_pools WHERE id = $1', [id]);
    return { id, reset: true };
  });
}
