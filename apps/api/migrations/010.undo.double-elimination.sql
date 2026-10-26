SET search_path TO axsuck, public;

ALTER TABLE axsuck.matches DROP CONSTRAINT IF EXISTS matches_bracket_slot_key;
ALTER TABLE axsuck.matches
  ADD CONSTRAINT matches_tournament_id_round_position_key
  UNIQUE (tournament_id, round, position);

ALTER TABLE axsuck.matches
  DROP COLUMN IF EXISTS slot2_void,
  DROP COLUMN IF EXISTS slot1_void,
  DROP COLUMN IF EXISTS loser_next_slot,
  DROP COLUMN IF EXISTS loser_next_match_id,
  DROP COLUMN IF EXISTS next_slot,
  DROP COLUMN IF EXISTS next_match_id,
  DROP COLUMN IF EXISTS bracket;

ALTER TABLE axsuck.tournaments DROP COLUMN IF EXISTS grand_final_reset;
