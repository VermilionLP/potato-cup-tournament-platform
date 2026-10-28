SET search_path TO axsuck, public;

ALTER TABLE tournaments DROP COLUMN IF EXISTS vehicle_template;
DELETE FROM vehicle_pools WHERE id NOT IN ('prop', 'prop-ab', 'legacy-jet', 'proleague');
ALTER TABLE vehicle_pools
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS event_type,
  DROP COLUMN IF EXISTS game_modes,
  DROP COLUMN IF EXISTS rules,
  DROP COLUMN IF EXISTS sort_order,
  DROP COLUMN IF EXISTS created_at;
