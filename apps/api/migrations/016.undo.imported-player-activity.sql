SET search_path TO axsuck, public;

-- Data-only migration: the previous last_seen_at values (the import time)
-- carried no information, so there is nothing to restore.
SELECT 1;
