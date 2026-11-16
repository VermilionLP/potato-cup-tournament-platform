-- 比赛地图 for vehicle pool templates and map thumbnails. A template lists
-- the maps its events use (vehicle_pools.missions, ids in order); an event's
-- own tournaments.missions, when set, comes first. A map has a picture shown
-- on cards (missions.image, at most 2 MB, image_version changes its URL) and
-- the place it shows (location, e.g. "Kursk").
ALTER TABLE axsuck.vehicle_pools ADD COLUMN IF NOT EXISTS missions TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE axsuck.missions ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE axsuck.missions ADD COLUMN IF NOT EXISTS image BYTEA;
ALTER TABLE axsuck.missions ADD COLUMN IF NOT EXISTS image_type TEXT;
ALTER TABLE axsuck.missions ADD COLUMN IF NOT EXISTS image_version INTEGER NOT NULL DEFAULT 0;
