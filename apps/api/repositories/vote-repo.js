export function VoteRepo(db) {
  function getByTournament(tournamentId) {
    return db.prepare(`
      SELECT tv.*, p.display_name
      FROM time_votes tv
      JOIN players p ON p.id = tv.player_id
      WHERE tv.tournament_id = ?
      ORDER BY tv.proposed_time ASC, tv.created_at ASC
    `).all(tournamentId);
  }

  function upsert(tournamentId, playerId, proposedTime) {
    db.prepare(`
      INSERT OR IGNORE INTO time_votes (tournament_id, player_id, proposed_time)
      VALUES (?, ?, ?)
    `).run(tournamentId, playerId, proposedTime);

    const row = db.prepare(`
      SELECT tv.*, p.display_name
      FROM time_votes tv
      JOIN players p ON p.id = tv.player_id
      WHERE tv.tournament_id = ? AND tv.player_id = ? AND tv.proposed_time = ?
    `).get(tournamentId, playerId, proposedTime);

    return row;
  }

  function removeVote(tournamentId, playerId, proposedTime) {
    if (proposedTime) {
      db.prepare(`
        DELETE FROM time_votes WHERE tournament_id = ? AND player_id = ? AND proposed_time = ?
      `).run(tournamentId, playerId, proposedTime);
    } else {
      db.prepare(`
        DELETE FROM time_votes WHERE tournament_id = ? AND player_id = ?
      `).run(tournamentId, playerId);
    }
  }

  function clearByTournament(tournamentId) {
    db.prepare(`DELETE FROM time_votes WHERE tournament_id = ?`).run(tournamentId);
  }

  return { getByTournament, upsert, removeVote, clearByTournament };
}
