SET search_path TO axsuck, public;

-- Mode variants of an event type's pool (prop-ab: AB 螺旋桨) can be saved
-- too. The application checks pool ids (POOL_IDS), so the column check is
-- dropped instead of listing every id here.
ALTER TABLE vehicle_pools DROP CONSTRAINT IF EXISTS vehicle_pools_id_check;
