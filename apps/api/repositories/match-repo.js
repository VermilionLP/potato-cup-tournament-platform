// Matches of an event. The work is split by concern under ./match/:
// queries.js (reads / plain writes), generation.js (building brackets,
// Swiss rounds, groups, playoffs), progression.js (results moving through
// a bracket), rows.js (inserting generated rows); transactions use lib/transaction.js.

import { matchQueries } from './match/queries.js';
import { matchGeneration } from './match/generation.js';
import { matchProgression } from './match/progression.js';

export function MatchRepo(db) {
  const queries = matchQueries(db);
  const generation = matchGeneration(db, queries);
  const progression = matchProgression(db, queries, generation);
  return {
    getById: queries.getById,
    getByTournament: queries.getByTournament,
    create: queries.create,
    submitResult: progression.submitResult,
    generateBracket: generation.generateBracket,
    advanceWinner: progression.advanceWinner,
    advanceSwiss: generation.advanceSwiss,
    generatePlayoffs: generation.generatePlayoffs,
    clearPlayoffs: generation.clearPlayoffs,
    clearMatches: queries.clearMatches,
  };
}
