import fp from 'fastify-plugin';
import postgresPlugin from '@fastify/postgres';
import Postgrator from 'postgrator';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default fp(async function databasePlugin(fastify) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Register postgres plugin with search_path option
  await fastify.register(postgresPlugin, {
    connectionString,
    options: '-c search_path=axsuck,public'
  });

  // Alias fastify.db to fastify.pg for consistency across monorepo apps
  fastify.decorate('db', fastify.pg);

  // Run database migrations before server starts listening
  try {
    fastify.log.info('Ensuring axsuck schema exists and running Postgrator migrations...');
    await fastify.pg.query('CREATE SCHEMA IF NOT EXISTS axsuck');
    await fastify.pg.query('SET search_path TO axsuck, public');

    const postgrator = new Postgrator({
      migrationPattern: join(__dirname, '../migrations/*').replace(/\\/g, '/'),
      driver: 'pg',
      schemaTable: 'axsuck.schemaversion',
      execQuery: (query) => fastify.pg.query(query)
    });

    const appliedMigrations = await postgrator.migrate();
    if (appliedMigrations.length > 0) {
      fastify.log.info(`Successfully applied ${appliedMigrations.length} database migrations to axsuck schema.`);
    } else {
      fastify.log.info('Database migrations in axsuck schema are already up to date.');
    }
  } catch (dbErr) {
    fastify.log.error('Failed to run database migrations: ' + dbErr.message);
  }
}, { name: 'database-plugin' });
