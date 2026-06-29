import { getPlayerDisplayName } from './player-repo.js';

export function CustomVoteRepo(db) {
  function getByTournament(tournamentId) {
    const rows = db.prepare(`
      SELECT cv.*, p.battle_tags, p.id AS player_id
      FROM custom_votes cv
      JOIN players p ON p.id = cv.player_id
      WHERE cv.tournament_id = ?
      ORDER BY cv.topic ASC, cv.value ASC, cv.created_at ASC
    `).all(tournamentId);

    return rows.map(row => ({
      ...row,
      display_name: getPlayerDisplayName({ id: row.player_id, battle_tags: row.battle_tags })
    }));
  }

  function upsert(tournamentId, playerId, topic, value) {
    db.prepare(`
      INSERT OR IGNORE INTO custom_votes (tournament_id, player_id, topic, value)
      VALUES (?, ?, ?, ?)
    `).run(tournamentId, playerId, topic, value);

    const row = db.prepare(`
      SELECT cv.*, p.battle_tags, p.id AS player_id
      FROM custom_votes cv
      JOIN players p ON p.id = cv.player_id
      WHERE cv.tournament_id = ? AND cv.player_id = ? AND cv.topic = ? AND cv.value = ?
    `).get(tournamentId, playerId, topic, value);

    if (!row) return null;
    return {
      ...row,
      display_name: getPlayerDisplayName({ id: row.player_id, battle_tags: row.battle_tags })
    };
  }

  function removeVote(tournamentId, playerId, topic, value) {
    if (topic && value) {
      db.prepare(`
        DELETE FROM custom_votes 
        WHERE tournament_id = ? AND player_id = ? AND topic = ? AND value = ?
      `).run(tournamentId, playerId, topic, value);
    } else if (topic) {
      db.prepare(`
        DELETE FROM custom_votes 
        WHERE tournament_id = ? AND player_id = ? AND topic = ?
      `).run(tournamentId, playerId, topic);
    } else {
      db.prepare(`
        DELETE FROM custom_votes 
        WHERE tournament_id = ? AND player_id = ?
      `).run(tournamentId, playerId);
    }
  }

  function clearByTournament(tournamentId) {
    db.prepare(`DELETE FROM custom_votes WHERE tournament_id = ?`).run(tournamentId);
  }

  return { getByTournament, upsert, removeVote, clearByTournament };
}
