-- 比赛地图: War Thunder mission files (.blk text) players paste into custom
-- battles ("Missions by URL", GET /api/missions/<id>.blk). The current text
-- is in missions.content; every saved text is kept in mission_versions so
-- admins can go back. An event lists the maps it uses (tournaments.missions,
-- ids in order).
CREATE TABLE IF NOT EXISTS axsuck.missions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  credit TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS axsuck.mission_versions (
  mission_id TEXT NOT NULL REFERENCES axsuck.missions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mission_id, version)
);
ALTER TABLE axsuck.tournaments ADD COLUMN IF NOT EXISTS missions TEXT[] NOT NULL DEFAULT '{}';
