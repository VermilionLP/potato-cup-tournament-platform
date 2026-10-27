SET search_path TO axsuck, public;

-- StarCraft II leftovers: Battle.net account links (per player and per
-- event) were only used to match uploaded replays, which were removed.
-- The pre-deploy database backup keeps the old data.
DROP TABLE IF EXISTS tournament_player_accounts;
ALTER TABLE players DROP COLUMN IF EXISTS bnet_ids;
