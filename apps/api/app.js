import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { EventEmitter } from 'events';

import databasePlugin from './plugins/database.js';
import tournamentsRoutes from './routes/tournaments.js';
import playersRoutes from './routes/players.js';
import matchesRoutes from './routes/matches.js';
import votesRoutes from './routes/votes.js';
import replaysRoutes, { checkPythonEnvironment } from './routes/replays.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

const fastify = Fastify({ logger: true, trustProxy: true });
const tournamentEvents = new EventEmitter();
fastify.decorate('tournamentEvents', tournamentEvents);

await fastify.register(cors, { origin: true, credentials: true });
await fastify.register(sensible);
await fastify.register(swagger, {
  openapi: { info: { title: 'S.U.C.K Tournament API', version: pkg.version } }
});
await fastify.register(swaggerUi, { routePrefix: '/docs' });
await fastify.register(databasePlugin);
await fastify.register(tournamentsRoutes, { prefix: '/api' });
await fastify.register(playersRoutes, { prefix: '/api' });
await fastify.register(matchesRoutes, { prefix: '/api' });
await fastify.register(votesRoutes, { prefix: '/api' });
await fastify.register(replaysRoutes, { prefix: '/api' });

// Runtime Python check on startup
checkPythonEnvironment().then((status) => {
  if (status.ok) {
    console.log('✅ Python environment verified: sc2reader and spawningtool are available.');
  } else {
    console.warn('⚠️ WARNING: Server Python environment check failed. SC2 replay parsing will not be available.');
    console.warn(`Reason: ${status.error}`);
  }
});

fastify.get('/api/ping', async () => ({ pong: true }));

await fastify.register(fastifyStatic, {
  root: join(__dirname, '..', 'web', 'build'),
  prefix: '/',
  wildcard: false
});

fastify.setNotFoundHandler((req, reply) => {
  if (!req.url.startsWith('/api')) {
    return reply.sendFile('index.html');
  }
  reply.code(404).send({ error: 'Not found' });
});

const port = parseInt(process.env.PORT || '3100');

try {
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`API running at http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
