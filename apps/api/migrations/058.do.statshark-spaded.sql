-- Statshark (statshark.net): a player's Statshark id (their profile page
-- statshark.net/player/<id>) and their spaded vehicles from its API, fetched
-- for the players of an event when it starts (lib/statshark.js). Ban / Pick
-- leaves out the pool vehicles neither player has spaded.
ALTER TABLE axsuck.players
  ADD COLUMN IF NOT EXISTS statshark_id TEXT CHECK (statshark_id ~ '^[0-9]{1,20}$'),
  ADD COLUMN IF NOT EXISTS spaded_units TEXT[],
  ADD COLUMN IF NOT EXISTS spaded_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS spaded_error TEXT;

-- Requests made to the Statshark API per day (UTC), against its daily limit.
CREATE TABLE IF NOT EXISTS axsuck.statshark_usage (
  day DATE PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0
);
