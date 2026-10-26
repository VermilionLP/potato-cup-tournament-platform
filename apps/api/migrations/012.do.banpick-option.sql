SET search_path TO axsuck, public;

-- Whether match cards offer the Ban / Pick tool. Existing tournaments keep it.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS banpick_enabled BOOLEAN NOT NULL DEFAULT TRUE;
