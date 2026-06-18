import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync, mkdirSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDbPath = join(__dirname, '..', 'data', 'test.db');

if (existsSync(testDbPath)) {
  unlinkSync(testDbPath);
}

const dbDir = join(dirname(testDbPath));
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

console.log('1. Initializing test database at:', testDbPath);
const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 2. Run migrations
let currentVersion = db.pragma('user_version', { simple: true });
console.log('Initial user_version:', currentVersion);

const runSelfHealingChecks = () => {
  // Empty mock for verification
};

const migrations = [
  // Migration 1: Baseline schema
  () => {
    console.log('Running database migration v1: baseline schema...');
    const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
    db.exec(schema);
    runSelfHealingChecks();
  },
  // Migration 2: Add match_replays table
  () => {
    console.log('Running database migration v2: creating match_replays table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS match_replays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        compressed_data BLOB NOT NULL, -- gzipped SC2Replay file
        parsed_data TEXT NOT NULL,      -- JSON string of all stats (chat, build order, curve data, etc.)
        winner TEXT,
        map_name TEXT,
        game_length INTEGER,            -- in seconds
        uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_match_replays_match_id ON match_replays(match_id);
    `);
  }
];

if (currentVersion < migrations.length) {
  const runMigrationTx = db.transaction(() => {
    for (let i = currentVersion; i < migrations.length; i++) {
      migrations[i]();
      db.pragma(`user_version = ${i + 1}`);
    }
  });
  runMigrationTx();
}

const finalVersion = db.pragma('user_version', { simple: true });
console.log('Final user_version after migrations:', finalVersion);

if (finalVersion !== 2) {
  console.error('❌ Migration version check failed!');
  process.exit(1);
}

// Verify tables exist
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log('Created tables:', tables);

if (!tables.includes('match_replays')) {
  console.error('❌ match_replays table was not created!');
  process.exit(1);
}

console.log('✅ SQLite migrations verified successfully!');
db.close();
unlinkSync(testDbPath);
process.exit(0);
