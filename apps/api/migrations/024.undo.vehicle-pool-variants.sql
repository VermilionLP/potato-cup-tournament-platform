SET search_path TO axsuck, public;

DELETE FROM vehicle_pools WHERE id NOT IN ('prop', 'legacy-jet', 'proleague');
ALTER TABLE vehicle_pools ADD CONSTRAINT vehicle_pools_id_check CHECK (id IN ('prop', 'legacy-jet', 'proleague'));
