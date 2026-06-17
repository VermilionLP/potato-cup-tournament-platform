export function PlayerRepo(db) {
  function getById(id) {
    return db.prepare(`SELECT * FROM players WHERE id = ?`).get(id);
  }

  function upsert(id, displayName) {
    db.prepare(`
      INSERT INTO players (id, display_name) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name
    `).run(id, displayName || id);
    return getById(id);
  }

  function getTournaments(playerId) {
    return db.prepare(`
      SELECT t.*, tp.seed, tp.registered_at
      FROM tournament_players tp
      JOIN tournaments t ON t.id = tp.tournament_id
      WHERE tp.player_id = ?
      ORDER BY t.created_at DESC
    `).all(playerId);
  }

  function list() {
    return db.prepare(`SELECT * FROM players ORDER BY display_name ASC`).all();
  }

  return { getById, upsert, getTournaments, list };
}
