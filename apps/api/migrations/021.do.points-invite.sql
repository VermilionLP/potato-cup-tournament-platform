SET search_path TO axsuck, public;

-- Whether the event's champion gets a direct invite to the Winter Finals
-- (直邀名额), set by admins at any time. Monthly events had it so far.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS points_invite BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE tournaments SET points_invite = TRUE WHERE points_kind = 'monthly' AND points_table IS NOT NULL;
