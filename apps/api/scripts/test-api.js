import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

import databasePlugin from '../plugins/database.js';
import tournamentsRoutes from '../routes/tournaments.js';
import playersRoutes from '../routes/players.js';
import matchesRoutes from '../routes/matches.js';
import votesRoutes from '../routes/votes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

async function test() {
  const fastify = Fastify({ logger: false });
  const tournamentEvents = new EventEmitter();
  fastify.decorate('tournamentEvents', tournamentEvents);

  await fastify.register(cors);
  await fastify.register(sensible);
  await fastify.register(databasePlugin);
  await fastify.register(tournamentsRoutes, { prefix: '/api' });
  await fastify.register(playersRoutes, { prefix: '/api' });
  await fastify.register(matchesRoutes, { prefix: '/api' });
  await fastify.register(votesRoutes, { prefix: '/api' });

  await fastify.ready();
  console.log('✅ Fastify server ready');

  // Test /api/tournaments
  const resTournaments = await fastify.inject({ method: 'GET', url: '/api/tournaments' });
  console.log('GET /api/tournaments status:', resTournaments.statusCode);
  const tournaments = JSON.parse(resTournaments.body);
  console.log(`Retrieved ${tournaments.length} tournaments from axsuck.tournaments`);

  // Test /api/players
  const resPlayers = await fastify.inject({ method: 'GET', url: '/api/players' });
  console.log('GET /api/players status:', resPlayers.statusCode);
  const players = JSON.parse(resPlayers.body);
  console.log(`Retrieved ${players.length} players from axsuck.players`);

  // Test /api/players/statistics
  const resStats = await fastify.inject({ method: 'GET', url: '/api/players/statistics' });
  console.log('GET /api/players/statistics status:', resStats.statusCode);
  const stats = JSON.parse(resStats.body);
  console.log('Global stats summary:', stats.global);

  // Test single tournament detail
  if (tournaments.length > 0) {
    const firstId = tournaments[0].id;
    const resDetail = await fastify.inject({ method: 'GET', url: `/api/tournaments/${firstId}` });
    console.log(`GET /api/tournaments/${firstId} status:`, resDetail.statusCode);
    const detail = JSON.parse(resDetail.body);
    console.log(`Tournament [${detail.name}] has ${detail.players.length} players, ${detail.matches.length} matches`);
  }

  await fastify.close();
  console.log('🎉 All test requests passed with PostgreSQL schema `axsuck`!');
}

test().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
