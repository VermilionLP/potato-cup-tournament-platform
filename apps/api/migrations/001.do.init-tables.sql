CREATE SCHEMA IF NOT EXISTS axsuck;

SET search_path TO axsuck, public;

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  flag TEXT DEFAULT 'cn',
  team TEXT DEFAULT '',
  link TEXT DEFAULT '',
  bnet_ids TEXT DEFAULT '[]',
  battle_tags TEXT DEFAULT '{}',
  last_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'voting'
    CHECK (status IN ('registration', 'voting', 'in_progress', 'completed')),
  player_capacity INTEGER NOT NULL DEFAULT 16,
  hold_third_place INTEGER NOT NULL DEFAULT 0,
  scheduled_time TEXT DEFAULT '',
  active_match_id INTEGER,
  overlay_scene TEXT DEFAULT 'auto',
  overlay_round INTEGER,
  loser_advances INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  seed INTEGER,
  team TEXT DEFAULT '',
  flag TEXT DEFAULT 'cn',
  link TEXT DEFAULT '',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, round, position)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tournaments_active_match'
  ) THEN
    ALTER TABLE tournaments 
      ADD CONSTRAINT fk_tournaments_active_match 
      FOREIGN KEY (active_match_id) REFERENCES matches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS time_votes (
  id SERIAL PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  proposed_time TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, player_id, proposed_time)
);

CREATE TABLE IF NOT EXISTS custom_votes (
  id SERIAL PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  topic TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, player_id, topic, value)
);
CREATE INDEX IF NOT EXISTS idx_custom_votes_tournament ON custom_votes(tournament_id);

CREATE TABLE IF NOT EXISTS match_replays (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  compressed_data BYTEA NOT NULL,
  parsed_data TEXT NOT NULL,
  winner TEXT,
  map_name TEXT,
  game_length INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_replays_match_id ON match_replays(match_id);
