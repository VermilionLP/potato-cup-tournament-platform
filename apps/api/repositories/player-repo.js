export function getPlayerDisplayName(player) {
  if (!player) return '';
  return player.id;
}

export function PlayerRepo(db) {
  function getById(id) {
    const p = db.prepare(`SELECT * FROM players WHERE id = ?`).get(id);
    if (!p) return null;
    return {
      ...p,
      display_name: getPlayerDisplayName(p)
    };
  }

  function upsert(id, flag = 'cn', team = '', link = '', battleTags = '{}', lastIp = null) {
    const columns = db.prepare(`PRAGMA table_info(players)`).all().map(c => c.name);
    
    if (columns.includes('battle_tags')) {
      if (columns.includes('display_name')) {
        const displayName = getPlayerDisplayName({ id, battle_tags: battleTags });
        db.prepare(`
          INSERT INTO players (id, display_name, flag, team, link, battle_tags, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            display_name = excluded.display_name,
            flag = excluded.flag,
            team = excluded.team,
            link = excluded.link,
            battle_tags = excluded.battle_tags,
            last_ip = COALESCE(excluded.last_ip, players.last_ip)
        `).run(id, displayName, flag || 'cn', team || '', link || '', battleTags || '{}', lastIp);
      } else {
        db.prepare(`
          INSERT INTO players (id, flag, team, link, battle_tags, last_ip) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            flag = excluded.flag,
            team = excluded.team,
            link = excluded.link,
            battle_tags = excluded.battle_tags,
            last_ip = COALESCE(excluded.last_ip, players.last_ip)
        `).run(id, flag || 'cn', team || '', link || '', battleTags || '{}', lastIp);
      }
    } else {
      db.prepare(`
        INSERT INTO players (id, display_name, flag, team, link, last_ip) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          display_name = excluded.display_name,
          flag = excluded.flag,
          team = excluded.team,
          link = excluded.link,
          last_ip = COALESCE(excluded.last_ip, players.last_ip)
      `).run(id, id, flag || 'cn', team || '', link || '', lastIp);
    }
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
    const players = db.prepare(`SELECT * FROM players`).all();
    return players.map(p => ({
      ...p,
      display_name: getPlayerDisplayName(p)
    })).sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  return { getById, upsert, getTournaments, list };
}
