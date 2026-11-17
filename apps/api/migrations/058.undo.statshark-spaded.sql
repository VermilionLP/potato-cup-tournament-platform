DROP TABLE IF EXISTS axsuck.statshark_usage;
ALTER TABLE axsuck.players
  DROP COLUMN IF EXISTS spaded_error,
  DROP COLUMN IF EXISTS spaded_fetched_at,
  DROP COLUMN IF EXISTS spaded_units,
  DROP COLUMN IF EXISTS statshark_id;
