import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

import databasePlugin from './plugins/database.js';
import tournamentsRoutes from './routes/tournaments.js';
import playersRoutes from './routes/players.js';
import matchesRoutes from './routes/matches.js';
import votesRoutes from './routes/votes.js';
import ladderRoutes from './routes/ladder.js';
import replaysRoutes, { checkPythonEnvironment } from './routes/replays.js';
import pushRoutes from './routes/push.js';
import adminRoutes from './routes/admin.js';
import { startPushScheduler } from './lib/push-scheduler.js';
import { createEsLogger, registerRequestLogging } from './lib/es-logger.js';
import fastifySse from '@fastify/sse';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

const fastify = Fastify({ logger: true, trustProxy: true, bodyLimit: 104857600 });
const tournamentEvents = new EventEmitter();
fastify.decorate('tournamentEvents', tournamentEvents);

const esLogger = createEsLogger();
fastify.decorate('esLogger', esLogger);
registerRequestLogging(fastify, esLogger);

await fastify.register(cors, { origin: true, credentials: true });
await fastify.register(sensible);
await fastify.register(fastifySse, { heartbeatInterval: 20000 });
await fastify.register(swagger, {
  openapi: { info: { title: 'S.U.C.K Tournament API', version: pkg.version } }
});
await fastify.register(swaggerUi, { routePrefix: '/docs' });
await fastify.register(databasePlugin);
await fastify.register(tournamentsRoutes, { prefix: '/api' });
await fastify.register(playersRoutes, { prefix: '/api' });
await fastify.register(matchesRoutes, { prefix: '/api' });
await fastify.register(votesRoutes, { prefix: '/api' });
await fastify.register(ladderRoutes, { prefix: '/api' });
await fastify.register(replaysRoutes, { prefix: '/api' });
await fastify.register(pushRoutes, { prefix: '/api' });
await fastify.register(adminRoutes, { prefix: '/api' });
startPushScheduler(fastify);

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

const candidatePaths = [
  process.env.STATIC_DIR,
  join(__dirname, '..', 'web', 'build'),
  join(__dirname, '..', 'suck-tournament-web', 'build')
].filter(Boolean);

const staticRoot = candidatePaths.find(p => existsSync(p));
if (staticRoot) {
  await fastify.register(fastifyStatic, {
    root: staticRoot,
    prefix: '/',
    wildcard: false
  });

  fastify.setNotFoundHandler((req, reply) => {
    if (!req.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ error: 'Not found' });
  });
} else {
  fastify.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: 'Not found' });
  });
}

const port = parseInt(process.env.PORT || '3100');

if (esLogger.enabled) {
  console.log(`Elasticsearch logging enabled: ${esLogger.url} (index ${esLogger.indexPrefix})`);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    try {
      await fastify.close();
    } catch (err) {
      fastify.log.error(err);
      process.exitCode = 1;
    }
    process.exit();
  });
}

try {
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`API running at http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
