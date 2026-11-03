-- Optional ladder limit on who may sign up for an event themselves: a
-- highest MMR or a highest league (tier group, e.g. 'gold'), in the event's
-- own ladder division. At most one is set; admins can still add anyone.
ALTER TABLE axsuck.tournaments
  ADD COLUMN IF NOT EXISTS ladder_max_mmr INTEGER,
  ADD COLUMN IF NOT EXISTS ladder_max_tier TEXT;
