SET search_path TO axsuck, public;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS grand_final_reset BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS bracket TEXT NOT NULL DEFAULT 'main'
    CHECK (bracket IN ('main', 'wb', 'lb', 'gf')),
  ADD COLUMN IF NOT EXISTS next_match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_slot SMALLINT CHECK (next_slot IN (1, 2)),
  ADD COLUMN IF NOT EXISTS loser_next_match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loser_next_slot SMALLINT CHECK (loser_next_slot IN (1, 2)),
  ADD COLUMN IF NOT EXISTS slot1_void BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS slot2_void BOOLEAN NOT NULL DEFAULT FALSE;

-- Single elimination used to be the only format, so (round, position) was
-- unique per tournament. Winners and losers brackets each number their rounds
-- from 1, so the bracket has to be part of the key. Drop the old unique
-- constraint whatever Postgres named it.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'axsuck.matches'::regclass
      AND contype = 'u'
      AND conname <> 'matches_bracket_slot_key'
  LOOP
    EXECUTE format('ALTER TABLE axsuck.matches DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE axsuck.matches
  ADD CONSTRAINT matches_bracket_slot_key
  UNIQUE (tournament_id, bracket, round, position);
