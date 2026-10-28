-- Top Jet goes back into Legacy Jet (events and vehicle pool templates).
UPDATE axsuck.tournaments SET vehicle_pool = 'legacy-jet' WHERE vehicle_pool = 'top-jet';
UPDATE axsuck.vehicle_pools SET event_type = 'legacy-jet' WHERE event_type = 'top-jet';
