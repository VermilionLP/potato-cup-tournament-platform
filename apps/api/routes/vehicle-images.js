// GET /vehicle-images/slots/<unit>.png and /vehicle-images/country/<nation>.png:
// War Thunder wiki pictures through this server's disk cache
// (lib/vehicle-images.js). 404 when the wiki has none (or is unreachable).

import { vehicleImageStore } from '../lib/vehicle-images.js';

export default async function vehicleImageRoutes(fastify, opts = {}) {
  const store = opts.store || vehicleImageStore({ log: fastify.log });

  fastify.get('/vehicle-images/:kind/:file', async (req, reply) => {
    const body = await store.get(req.params.kind, req.params.file);
    if (!body) throw fastify.httpErrors.notFound('Image not found');
    reply.header('content-type', 'image/png');
    reply.header('cache-control', 'public, max-age=604800');
    return body;
  });
}
