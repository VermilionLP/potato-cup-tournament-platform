-- Season / monthly / misc can't be told apart again: major events become monthly.
ALTER TABLE axsuck.tournaments DROP CONSTRAINT IF EXISTS tournaments_event_kind_check;
UPDATE axsuck.tournaments SET event_kind = 'monthly' WHERE event_kind = 'major';
ALTER TABLE axsuck.tournaments
  ADD CONSTRAINT tournaments_event_kind_check CHECK (event_kind IN ('season', 'monthly', 'weekly', 'qualifier', 'misc'));
