DROP INDEX IF EXISTS axsuck.idx_bot_notices_match;
ALTER TABLE axsuck.bot_notices DROP COLUMN IF EXISTS match_id, DROP COLUMN IF EXISTS data;
