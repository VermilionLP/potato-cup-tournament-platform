SET search_path TO axsuck, public;

-- Kind of points event: 'weekly' (周赛) or 'monthly' (月赛). A monthly
-- champion qualifies for the Winter Finals regardless of points.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS points_kind TEXT;
