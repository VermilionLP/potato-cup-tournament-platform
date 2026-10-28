-- New event type Top Jet (top-jet, 顶级喷气). Jet events before Potato Cup
-- Weekly #23 (2026-05-30, Beijing time) were Top Jet: move the Legacy Jet
-- events played before then. "Played" is the same date the ladder orders
-- by (lib: LadderRepo PLAYED_AT): the imported date, else the scheduled
-- time (Beijing), else when the event was created.
UPDATE axsuck.tournaments t
SET vehicle_pool = 'top-jet', updated_at = NOW()
WHERE t.vehicle_pool = 'legacy-jet'
  AND COALESCE(
    t.played_at,
    CASE WHEN t.scheduled_time ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[T ]([01]\d|2[0-3]):[0-5]\d'
      THEN substring(t.scheduled_time from 1 for 16)::timestamp AT TIME ZONE 'Asia/Shanghai'
    END,
    t.created_at
  ) < TIMESTAMP '2026-05-30 00:00' AT TIME ZONE 'Asia/Shanghai';
