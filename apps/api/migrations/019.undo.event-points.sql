SET search_path TO axsuck, public;

ALTER TABLE tournaments DROP COLUMN IF EXISTS points_season;
ALTER TABLE tournaments DROP COLUMN IF EXISTS points_table;
