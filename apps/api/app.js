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
import tournamentSettingsRoutes from './routes/tournament-settings.js';
import tournamentBracketRoutes from './routes/tournament-bracket.js';
import tournamentImportRoutes from './routes/tournament-import.js';
import playersRoutes from './routes/players.js';
import matchesRoutes from './routes/matches.js';
import votesRoutes from './routes/votes.js';
import ladderRoutes from './routes/ladder.js';
import wikiRoutes from './routes/wiki.js';
import pushRoutes from './routes/push.js';
import adminRoutes from './routes/admin.js';
import vehiclePoolRoutes from './routes/vehicle-pools.js';
import pointsRoutes from './routes/points.js';
import { startPushScheduler } from './lib/push-scheduler.js';
import { createEsLogger, registerRequestLogging } from './lib/es-logger.js';
import { registerRateLimit } from './lib/rate-limit.js';
import { registerLadderCacheInvalidation } from './lib/ladder-cache.js';
import { staticCacheHeaders } from './lib/static-cache.js';
import fastifySse from '@fastify/sse';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

// X-Forwarded-For is trusted only from a proxy on this machine (nginx), so
// clients cannot fake their IP; set TRUST_PROXY (e.g. an address or "true")
// when another proxy sits in front. Request bodies are JSON (the largest is
// a full event import), so 5 MB is plenty.
const trustProxy = process.env.TRUST_PROXY
  ? (process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY)
  : '127.0.0.1,::1';
const fastify = Fastify({ logger: true, trustProxy, bodyLimit: 5 * 1024 * 1024 });
const tournamentEvents = new EventEmitter();
fastify.decorate('tournamentEvents', tournamentEvents);

const esLogger = createEsLogger();
fastify.decorate('esLogger', esLogger);
registerRequestLogging(fastify, esLogger);

await fastify.register(cors, { origin: true, credentials: true });
await fastify.register(sensible);
registerRateLimit(fastify);
registerLadderCacheInvalidation(fastify);
await fastify.register(fastifySse, { heartbeatInterval: 20000 });
await fastify.register(swagger, {
  openapi: { info: { title: 'Potato Cup Tournament API', version: pkg.version } }
});
await fastify.register(swaggerUi, { routePrefix: '/docs' });
await fastify.register(databasePlugin);
await fastify.register(tournamentsRoutes, { prefix: '/api' });
await fastify.register(tournamentSettingsRoutes, { prefix: '/api' });
await fastify.register(tournamentBracketRoutes, { prefix: '/api' });
await fastify.register(tournamentImportRoutes, { prefix: '/api' });
await fastify.register(playersRoutes, { prefix: '/api' });
await fastify.register(matchesRoutes, { prefix: '/api' });
await fastify.register(votesRoutes, { prefix: '/api' });
await fastify.register(ladderRoutes, { prefix: '/api' });
await fastify.register(wikiRoutes, { prefix: '/api' });
await fastify.register(pushRoutes, { prefix: '/api' });
await fastify.register(adminRoutes, { prefix: '/api' });
await fastify.register(vehiclePoolRoutes, { prefix: '/api' });
await fastify.register(pointsRoutes, { prefix: '/api' });
startPushScheduler(fastify);

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
    wildcard: false,
    // Serve the build's .br / .gz copies when the browser accepts them.
    preCompressed: true,
    // Cache-Control comes from staticCacheHeaders (hashed files: a year;
    // pages: revalidate).
    cacheControl: false,
    setHeaders: staticCacheHeaders
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
