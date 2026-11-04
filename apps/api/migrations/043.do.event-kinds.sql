-- Event kinds become 大型赛事 (major) / 周赛 (weekly) / 预选赛 (qualifier):
-- season and monthly events are major, misc ones have no kind.
ALTER TABLE axsuck.tournaments DROP CONSTRAINT IF EXISTS tournaments_event_kind_check;
UPDATE axsuck.tournaments SET event_kind = 'major' WHERE event_kind IN ('season', 'monthly');
UPDATE axsuck.tournaments SET event_kind = NULL WHERE event_kind = 'misc';
ALTER TABLE axsuck.tournaments
  ADD CONSTRAINT tournaments_event_kind_check CHECK (event_kind IN ('major', 'weekly', 'qualifier'));
