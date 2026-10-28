// Imported single-elimination brackets (POST /tournaments/:id/import): the
// matches are rebuilt top-down from the final, so positions follow the
// bracket; a player with no match in a round got a bye there. Round 0 is
// the third-place match.

const imported = (m, round, position) => ({
  round,
  position,
  player1_id: m.player1_id || null,
  player2_id: m.player2_id || null,
  score1: m.score1 || 0,
  score2: m.score2 || 0,
  winner_id: m.winner_id || null,
  status: m.status || 'pending',
});

const bye = (playerId, round, position) => ({
  round,
  position,
  player1_id: playerId,
  player2_id: null,
  score1: 0,
  score2: 0,
  winner_id: playerId,
  status: 'completed',
});

/** Match rows ({ round, position, players, scores, winner, status }) to insert. */
export function reconstructImportedMatches(matchInputs = []) {
  const reconstructedMatches = [];
  const maxRound = Math.max(0, ...matchInputs.map((m) => (m.round > 0 ? m.round : 0)));
  if (maxRound > 0) {
    const finalMatch = matchInputs.find((m) => m.round === 1);
    if (finalMatch) reconstructedMatches.push(imported(finalMatch, 1, 1));
    for (let r = 1; r < maxRound; r++) {
      for (const parent of reconstructedMatches.filter((m) => m.round === r)) {
        // Each parent slot is fed by the match its player came from.
        for (const [playerId, position] of [[parent.player1_id, parent.position * 2 - 1], [parent.player2_id, parent.position * 2]]) {
          if (!playerId) continue;
          const child = matchInputs.find((m) => m.round === r + 1 && (m.player1_id === playerId || m.player2_id === playerId));
          reconstructedMatches.push(child ? imported(child, r + 1, position) : bye(playerId, r + 1, position));
        }
      }
    }
  }
  const thirdPlaceMatch = matchInputs.find((m) => m.round === 0);
  if (thirdPlaceMatch) reconstructedMatches.push(imported(thirdPlaceMatch, 0, 1));
  return reconstructedMatches;
}
