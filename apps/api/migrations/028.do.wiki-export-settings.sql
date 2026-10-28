-- Per-event settings of the Liquipedia export (page names, tier, prize
-- money, broadcast talent, streams); see lib/liquipedia/export-meta.js.
ALTER TABLE axsuck.tournaments ADD COLUMN IF NOT EXISTS wiki_meta JSONB;
