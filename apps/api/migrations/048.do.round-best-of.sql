-- Games per match for each bracket round ("BO3" on the round header):
-- { "main:1": 5, "wb:2": 3, "sw:1": 1, ... } keyed by bracket and round
-- (packages/shared/round-format.js roundKey). A round left out shows no
-- best-of.
ALTER TABLE axsuck.tournaments
  ADD COLUMN IF NOT EXISTS round_best_of JSONB NOT NULL DEFAULT '{}'::jsonb;
