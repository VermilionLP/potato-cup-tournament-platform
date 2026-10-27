SET search_path TO axsuck, public;

-- Overlay stage: one round of one bracket, "<bracket>:<round>" (e.g.
-- "wb:2", "lb:1", "sw:3"). overlay_round alone cannot tell the winners and
-- losers brackets of a double-elimination event apart.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS overlay_stage TEXT;
