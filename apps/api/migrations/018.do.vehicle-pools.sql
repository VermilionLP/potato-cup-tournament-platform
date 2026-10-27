SET search_path TO axsuck, public;

-- Vehicle pools edited on the site, one per event type. A type without a
-- row uses the pool bundled with the web app.
CREATE TABLE IF NOT EXISTS vehicle_pools (
  id TEXT PRIMARY KEY CHECK (id IN ('prop', 'legacy-jet', 'proleague')),
  vehicles JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
