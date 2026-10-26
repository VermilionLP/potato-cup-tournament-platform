SET search_path TO axsuck, public;

ALTER TABLE matches DROP COLUMN IF EXISTS swiss_group;
ALTER TABLE tournament_players DROP COLUMN IF EXISTS swiss_group;

ALTER TABLE tournaments
  DROP COLUMN IF EXISTS current_stage,
  DROP COLUMN IF EXISTS advance_per_group,
  DROP COLUMN IF EXISTS swiss_group_size,
  DROP COLUMN IF EXISTS playoff_format;
