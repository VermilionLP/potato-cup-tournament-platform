import fp from 'fastify-plugin';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default fp(async function databasePlugin(fastify) {
  const dbPath = process.env.DB_PATH || join(__dirname, '..', 'data', 'suck-tournament.db');
  const dbDir = join(dirname(dbPath));

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Self-healing migration for time_votes unique constraint
  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='time_votes'").get()?.sql;
    if (tableSql && !tableSql.includes('UNIQUE (tournament_id, player_id, proposed_time)')) {
      console.log('Migrating time_votes table: dropping stale constraints...');
      db.prepare('DROP TABLE time_votes').run();
    }
  } catch (err) {
    console.error('Migration check failed:', err);
  }

  // Self-healing migration for tournaments scheduled_time column
  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tournaments'").get()?.sql;
    if (tableSql && !tableSql.includes('scheduled_time')) {
      console.log('Migrating tournaments table: adding scheduled_time column...');
      db.prepare("ALTER TABLE tournaments ADD COLUMN scheduled_time TEXT DEFAULT ''").run();
    }
  } catch (err) {
    console.error('Tournaments migration check failed:', err);
  }

  const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);

  fastify.decorate('db', db);
});
