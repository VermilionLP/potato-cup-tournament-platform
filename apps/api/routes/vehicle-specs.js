// GET /vehicle-specs/<unit>: a vehicle's specifications (performance,
// engine, armament, limits) read from its War Thunder wiki page through this
// server's disk cache (lib/vehicle-specs.js), for the Ban / Pick overlay.
// 404 when the wiki has no such page (or can't be reached).

import { vehicleSpecsStore } from '../lib/vehicle-specs.js';

export default async function vehicleSpecsRoutes(fastify, opts = {}) {
  const store = opts.store || vehicleSpecsStore({ log: fastify.log });

  fastify.get('/vehicle-specs/:unit', async (req, reply) => {
    const specs = await store.get(req.params.unit);
    if (!specs) throw fastify.httpErrors.notFound('No specifications for this vehicle');
    reply.header('cache-control', 'public, max-age=3600');
    return specs;
  });
}
