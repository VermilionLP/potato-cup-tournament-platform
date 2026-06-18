export function PlayerRepo(db) {
  function getById(id) {
    return db.prepare(`SELECT * FROM players WHERE id = ?`).get(id);
  }

  function upsert(id, displayName, flag = 'cn', team = '', alias = '', link = '', bnet_ids = '[]', lastIp = null) {
    db.prepare(`
      INSERT INTO players (id, display_name, flag, team, alias, link, bnet_ids, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        display_name = excluded.display_name,
        flag = excluded.flag,
        team = excluded.team,
        alias = excluded.alias,
        link = excluded.link,
        bnet_ids = excluded.bnet_ids,
        last_ip = COALESCE(excluded.last_ip, players.last_ip)
    `).run(id, displayName || id, flag || 'cn', team || '', alias || '', link || '', bnet_ids || '[]', lastIp);
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
