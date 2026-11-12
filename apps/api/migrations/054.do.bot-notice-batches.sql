-- Notices about one match (ready, score to confirm, ban turn) remember it,
-- so ones overtaken by events (the match was played, the score handled,
-- the next ban turn came) are dropped instead of posted late; `data` keeps
-- the parts ready and result notices are merged from (lib/bot-notices.js
-- noticeBatches).
ALTER TABLE axsuck.bot_notices
  ADD COLUMN IF NOT EXISTS match_id INTEGER REFERENCES axsuck.matches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS data JSONB;
CREATE INDEX IF NOT EXISTS idx_bot_notices_match ON axsuck.bot_notices (match_id) WHERE sent_at IS NULL;
