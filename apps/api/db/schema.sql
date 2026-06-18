CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'voting'
    CHECK (status IN ('registration', 'voting', 'in_progress', 'completed')),
  player_capacity INTEGER NOT NULL DEFAULT 16,
  hold_third_place INTEGER NOT NULL DEFAULT 0,
  scheduled_time TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  flag TEXT DEFAULT 'cn',
  team TEXT DEFAULT '',
  alias TEXT DEFAULT '',
  link TEXT DEFAULT '',
  bnet_ids TEXT DEFAULT '[]',
  last_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  seed INTEGER,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  player1_id TEXT,
  player2_id TEXT,
  score1 INTEGER NOT NULL DEFAULT 0,
  score2 INTEGER NOT NULL DEFAULT 0,
  winner_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'walkover')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tournament_id, round, position)
);

CREATE TABLE IF NOT EXISTS time_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  proposed_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tournament_id, player_id, proposed_time)
);
