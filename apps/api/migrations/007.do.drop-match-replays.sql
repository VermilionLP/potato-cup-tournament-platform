SET search_path TO axsuck, public;

-- Replay upload/parsing has been removed from the platform.
-- The table was empty (no replay was ever parsed successfully), so dropping it
-- loses no data.
DROP TABLE IF EXISTS match_replays CASCADE;
