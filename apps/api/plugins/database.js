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

  // Run sequential user_version-based migrations
  let currentVersion = db.pragma('user_version', { simple: true });

  // If user_version is 0, check if baseline tables exist to identify v1 databases
  if (currentVersion === 0) {
    const hasTournaments = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tournaments'").get();
    if (hasTournaments) {
      currentVersion = 1;
      db.pragma('user_version = 1');
    }
  }

  // Self-healing migrations for existing time_votes constraint & tournaments scheduled_time column
  const runSelfHealingChecks = () => {
    try {
      const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='time_votes'").get()?.sql;
      if (tableSql && !tableSql.includes('UNIQUE (tournament_id, player_id, proposed_time)')) {
        console.log('Migrating time_votes table: dropping stale constraints...');
        db.prepare('DROP TABLE time_votes').run();
      }
    } catch (err) {
      console.error('Migration check failed:', err);
    }

    try {
      const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tournaments'").get()?.sql;
      if (tableSql && !tableSql.includes('scheduled_time')) {
        console.log('Migrating tournaments table: adding scheduled_time column...');
        db.prepare("ALTER TABLE tournaments ADD COLUMN scheduled_time TEXT DEFAULT ''").run();
      }
    } catch (err) {
      console.error('Tournaments migration check failed:', err);
    }
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
    },
    // Migration 3: Add flag, team, alias, link columns to players
    () => {
      console.log('Running database migration v3: adding flag, team, alias, link columns to players...');
      try {
        db.prepare("ALTER TABLE players ADD COLUMN flag TEXT DEFAULT 'cn'").run();
      } catch (e) {}
      try {
        db.prepare("ALTER TABLE players ADD COLUMN team TEXT DEFAULT ''").run();
      } catch (e) {}
      try {
        db.prepare("ALTER TABLE players ADD COLUMN alias TEXT DEFAULT ''").run();
      } catch (e) {}
      try {
        db.prepare("ALTER TABLE players ADD COLUMN link TEXT DEFAULT ''").run();
      } catch (e) {}
    },
    // Migration 4: Add snapshot columns to tournament_players & bnet_ids to players
    () => {
      console.log('Running database migration v4: adding snapshot columns to tournament_players & bnet_ids to players...');
      try {
        db.prepare("ALTER TABLE tournament_players ADD COLUMN flag TEXT").run();
      } catch (e) {}
      try {
        db.prepare("ALTER TABLE tournament_players ADD COLUMN team TEXT").run();
      } catch (e) {}
      try {
        db.prepare("ALTER TABLE tournament_players ADD COLUMN alias TEXT").run();
      } catch (e) {}
      try {
        db.prepare("ALTER TABLE tournament_players ADD COLUMN link TEXT").run();
      } catch (e) {}
      try {
        db.prepare("ALTER TABLE players ADD COLUMN bnet_ids TEXT DEFAULT '[]'").run();
      } catch (e) {}
    },
    // Migration 5: Add last_ip column to players
    () => {
      console.log('Running database migration v5: adding last_ip column to players...');
      try {
        db.prepare("ALTER TABLE players ADD COLUMN last_ip TEXT").run();
      } catch (e) {}
    },
    // Migration 6: Add battle_tags column to players
    () => {
      console.log('Running database migration v6: adding battle_tags column to players...');
      try {
        db.prepare("ALTER TABLE players ADD COLUMN battle_tags TEXT DEFAULT '{}'").run();
      } catch (e) {}
    },
    // Migration 7: Drop obsolete columns (display_name, alias from players; alias from tournament_players)
    () => {
      console.log('Running database migration v7: dropping obsolete columns display_name, alias...');
      try {
        const columnsPlayers = db.prepare(`PRAGMA table_info(players)`).all().map(c => c.name);
        if (columnsPlayers.includes('display_name')) {
          db.prepare("ALTER TABLE players DROP COLUMN display_name").run();
        }
        if (columnsPlayers.includes('alias')) {
          db.prepare("ALTER TABLE players DROP COLUMN alias").run();
        }
      } catch (e) {
        console.error("Migration v7 players table failed:", e);
      }
      try {
        const columnsTP = db.prepare(`PRAGMA table_info(tournament_players)`).all().map(c => c.name);
        if (columnsTP.includes('alias')) {
          db.prepare("ALTER TABLE tournament_players DROP COLUMN alias").run();
        }
      } catch (e) {
        console.error("Migration v7 tournament_players table failed:", e);
      }
    },
    // Migration 8: Add active_match_id column to tournaments
    () => {
      console.log('Running database migration v8: adding active_match_id column to tournaments...');
      try {
        const columnsTournaments = db.prepare(`PRAGMA table_info(tournaments)`).all().map(c => c.name);
        if (!columnsTournaments.includes('active_match_id')) {
          db.prepare("ALTER TABLE tournaments ADD COLUMN active_match_id INTEGER REFERENCES matches(id)").run();
        }
      } catch (e) {
        console.error("Migration v8 tournaments table failed:", e);
      }
    },
    // Migration 9: Add overlay_scene and overlay_round columns to tournaments
    () => {
      console.log('Running database migration v9: adding overlay_scene and overlay_round columns to tournaments...');
      try {
        const columnsTournaments = db.prepare(`PRAGMA table_info(tournaments)`).all().map(c => c.name);
        if (!columnsTournaments.includes('overlay_scene')) {
          db.prepare("ALTER TABLE tournaments ADD COLUMN overlay_scene TEXT DEFAULT 'auto'").run();
        }
        if (!columnsTournaments.includes('overlay_round')) {
          db.prepare("ALTER TABLE tournaments ADD COLUMN overlay_round INTEGER").run();
        }
      } catch (e) {
        console.error("Migration v9 tournaments table failed:", e);
      }
    },
    // Migration 10: Create custom_votes table
    () => {
      console.log('Running database migration v10: creating custom_votes table...');
      db.exec(`
        CREATE TABLE IF NOT EXISTS custom_votes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
          player_id TEXT NOT NULL REFERENCES players(id),
          topic TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (tournament_id, player_id, topic, value)
        );
        CREATE INDEX IF NOT EXISTS idx_custom_votes_tournament ON custom_votes(tournament_id);
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

  fastify.decorate('db', db);
});
