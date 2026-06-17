export function TournamentRepo(db) {
  function list() {
    return db.prepare(`SELECT * FROM tournaments ORDER BY created_at DESC`).all();
  }

  function getById(id) {
    return db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(id);
  }

  function create({ id, name, description, player_capacity, hold_third_place }) {
    db.prepare(`
      INSERT INTO tournaments (id, name, description, status, player_capacity, hold_third_place)
      VALUES (?, ?, ?, 'voting', ?, ?)
    `).run(id, name, description || '', player_capacity || 16, hold_third_place ? 1 : 0);
    return getById(id);
  }

  function updateStatus(id, status, scheduledTime = null) {
    if (scheduledTime !== null) {
      db.prepare(`
        UPDATE tournaments SET status = ?, scheduled_time = ?, updated_at = datetime('now') WHERE id = ?
      `).run(status, scheduledTime, id);
    } else {
      db.prepare(`
        UPDATE tournaments SET status = ?, updated_at = datetime('now') WHERE id = ?
      `).run(status, id);
    }
    return getById(id);
  }

  function getPlayers(tournamentId) {
    return db.prepare(`
      SELECT p.id, p.display_name, tp.seed, tp.registered_at
      FROM tournament_players tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.tournament_id = ?
      ORDER BY tp.seed IS NULL, tp.seed ASC, tp.registered_at ASC
    `).all(tournamentId);
  }

  function addPlayer(tournamentId, playerId) {
    const existing = db.prepare(`
      SELECT 1 FROM tournament_players WHERE tournament_id = ? AND player_id = ?
    `).get(tournamentId, playerId);
    if (existing) return false;

    const tourney = getById(tournamentId);
    if (!tourney) throw new Error('Tournament not found');

    const count = db.prepare(`
      SELECT COUNT(*) as cnt FROM tournament_players WHERE tournament_id = ?
    `).get(tournamentId).cnt;

    if (count >= tourney.player_capacity) {
      throw new Error('Tournament is full');
    }

    db.prepare(`
      INSERT OR IGNORE INTO players (id, display_name) VALUES (?, ?)
    `).run(playerId, playerId);

    db.prepare(`
      INSERT INTO tournament_players (tournament_id, player_id, seed) VALUES (?, ?, ?)
    `).run(tournamentId, playerId, count + 1);

    return true;
  }

  function removePlayer(tournamentId, playerId) {
    const tx = db.transaction(() => {
      db.prepare(`
        DELETE FROM tournament_players WHERE tournament_id = ? AND player_id = ?
      `).run(tournamentId, playerId);

      // Re-compact remaining player seeds
      const remaining = db.prepare(`
        SELECT player_id FROM tournament_players
        WHERE tournament_id = ?
        ORDER BY seed ASC, registered_at ASC
      `).all(tournamentId);

      remaining.forEach((p, idx) => {
        db.prepare(`
          UPDATE tournament_players SET seed = ?
          WHERE tournament_id = ? AND player_id = ?
        `).run(idx + 1, tournamentId, p.player_id);
      });
    });
    tx();
  }

  function setSeeds(tournamentId, playerIds) {
    const tx = db.transaction((ids) => {
      db.prepare(`
        UPDATE tournament_players SET seed = NULL WHERE tournament_id = ?
      `).run(tournamentId);
      ids.forEach((playerId, idx) => {
        db.prepare(`
          UPDATE tournament_players SET seed = ? WHERE tournament_id = ? AND player_id = ?
        `).run(idx + 1, tournamentId, playerId);
      });
    });
    tx(playerIds);
  }

  function getMatches(tournamentId) {
    return db.prepare(`
      SELECT * FROM matches WHERE tournament_id = ? ORDER BY round DESC, position ASC
    `).all(tournamentId);
  }

  function getVotes(tournamentId) {
    return db.prepare(`
      SELECT tv.*, p.display_name
      FROM time_votes tv
      JOIN players p ON p.id = tv.player_id
      WHERE tv.tournament_id = ?
      ORDER BY tv.created_at ASC
    `).all(tournamentId);
  }

  return { list, getById, create, updateStatus, getPlayers, addPlayer, removePlayer, setSeeds, getMatches, getVotes };
}
