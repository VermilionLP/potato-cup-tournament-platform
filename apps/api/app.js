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
import playerKeyRoutes from './routes/player-keys.js';
import playerStatsRoutes from './routes/player-stats.js';
import registrationRoutes from './routes/registrations.js';
import matchesRoutes from './routes/matches.js';
import votesRoutes from './routes/votes.js';
import ladderRoutes from './routes/ladder.js';
import wikiRoutes from './routes/wiki.js';
import pushRoutes from './routes/push.js';
import botRoutes from './routes/bot.js';
import reminderRoutes from './routes/reminders.js';
import vehicleImageRoutes from './routes/vehicle-images.js';
import vehicleSpecsRoutes from './routes/vehicle-specs.js';
import adminRoutes from './routes/admin.js';
import vehiclePoolRoutes from './routes/vehicle-pools.js';
import pointsRoutes from './routes/points.js';
import { startPushScheduler } from './lib/push-scheduler.js';
import { startReportScheduler } from './lib/report-scheduler.js';
import { startBotScheduler } from './lib/bot-scheduler.js';
import { createEsLogger, registerRequestLogging } from './lib/es-logger.js';
import { registerRateLimit } from './lib/rate-limit.js';
import { registerLadderCacheInvalidation } from './lib/ladder-cache.js';
import { staticCacheHeaders } from './lib/static-cache.js';
import { registerCompression } from './lib/compression.js';
import clientErrorRoutes from './routes/client-errors.js';
import { corsOrigin } from './lib/cors.js';
import { readFile } from 'node:fs/promises';
import { TournamentRepo } from './repositories/tournament-repo.js';
import { eventIdOfPath, eventMeta, injectMeta } from './lib/page-meta.js';
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
// One listener per open event page (SSE); a busy event has more than 10.
tournamentEvents.setMaxListeners(0);
fastify.decorate('tournamentEvents', tournamentEvents);

const esLogger = createEsLogger();
fastify.decorate('esLogger', esLogger);
registerRequestLogging(fastify, esLogger);
// gzip / Brotli for /api JSON (lib/compression.js); static files come pre-compressed.
registerCompression(fastify);

// Other sites' browsers may call the API only when listed in CORS_ORIGINS (lib/cors.js).
await fastify.register(cors, { origin: corsOrigin(), credentials: true });
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
await fastify.register(playerKeyRoutes, { prefix: '/api' });
await fastify.register(playerStatsRoutes, { prefix: '/api' });
await fastify.register(registrationRoutes, { prefix: '/api' });
await fastify.register(matchesRoutes, { prefix: '/api' });
await fastify.register(votesRoutes, { prefix: '/api' });
await fastify.register(ladderRoutes, { prefix: '/api' });
await fastify.register(wikiRoutes, { prefix: '/api' });
await fastify.register(pushRoutes, { prefix: '/api' });
await fastify.register(reminderRoutes, { prefix: '/api' });
await fastify.register(botRoutes, { prefix: '/api' });
await fastify.register(vehicleImageRoutes, { prefix: '/api' });
await fastify.register(vehicleSpecsRoutes, { prefix: '/api' });
await fastify.register(adminRoutes, { prefix: '/api' });
await fastify.register(vehiclePoolRoutes, { prefix: '/api' });
await fastify.register(pointsRoutes, { prefix: '/api' });
await fastify.register(clientErrorRoutes, { prefix: '/api' });
// Background jobs (push reminders, auto-confirming reports). BACKGROUND_JOBS=off
// for a second copy that only answers requests: the deploy preflight on a
// spare port and the CI smoke test.
if (process.env.BACKGROUND_JOBS !== 'off') {
  startPushScheduler(fastify);
  startReportScheduler(fastify);
  startBotScheduler(fastify);
}

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

  // Every page route gets the web app; an event page also carries its title
  // and description for link previews (Discord, QQ...; lib/page-meta.js).
  const tournamentsForMeta = TournamentRepo(fastify.db);
  fastify.setNotFoundHandler(async (req, reply) => {
    if (!req.url.startsWith('/api')) {
      const eventId = req.method === 'GET' ? eventIdOfPath(req.url) : null;
      if (eventId) {
        try {
          const t = await tournamentsForMeta.getById(eventId);
          if (t) {
            const origin = `${req.protocol}://${req.host}`;
            const html = await readFile(join(staticRoot, 'index.html'), 'utf8');
            reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache');
            return injectMeta(html, {
              ...eventMeta(t),
              url: `${origin}/tournament/${encodeURIComponent(eventId)}`,
              image: `${origin}/og-image.png`,
            });
          }
        } catch (err) {
          req.log.warn({ err }, 'event link preview failed; serving the plain page');
        }
      }
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
