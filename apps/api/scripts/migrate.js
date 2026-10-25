import pg from 'pg';
import Postgrator from 'postgrator';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Error: DATABASE_URL is not set in environment variables');
  process.exit(1);
}

async function runMigrations() {
  const client = new pg.Client({
    connectionString: dbUrl,
  });

  try {
    await client.connect();
    console.log('Connected to the database. Ensuring schema axsuck exists...');
    await client.query('CREATE SCHEMA IF NOT EXISTS axsuck');
    await client.query('SET search_path TO axsuck, public');

    const postgrator = new Postgrator({
      migrationPattern: path.join(__dirname, '../migrations/*').replace(/\\/g, '/'),
      driver: 'pg',
      schemaTable: 'axsuck.schemaversion',
      execQuery: (query) => client.query(query),
    });

    const appliedMigrations = await postgrator.migrate();
    if (appliedMigrations.length > 0) {
      console.log(`Successfully applied ${appliedMigrations.length} migrations:`);
      appliedMigrations.forEach((m) => {
        console.log(` - ${m.name}`);
      });
    } else {
      console.log('Database is already up to date. No migrations applied.');
    }
  } catch (err) {
    console.error('Database migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
