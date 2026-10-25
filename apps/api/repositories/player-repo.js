export function getPlayerDisplayName(player) {
  if (!player) return '';
  return player.id;
}

export function PlayerRepo(db) {
  async function getById(id) {
    const res = await db.query('SELECT * FROM axsuck.players WHERE id = $1', [id]);
    const p = res.rows[0];
    if (!p) return null;
    return {
      ...p,
      display_name: getPlayerDisplayName(p)
    };
  }

  async function upsert(id, flag = 'cn', team = '', link = '', battleTags = '{}', lastIp = null) {
    await db.query(`
      INSERT INTO axsuck.players (id, flag, team, link, battle_tags, last_ip, last_seen_at) 
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET 
        flag = EXCLUDED.flag,
        team = EXCLUDED.team,
        link = EXCLUDED.link,
        battle_tags = EXCLUDED.battle_tags,
        last_ip = COALESCE(EXCLUDED.last_ip, axsuck.players.last_ip),
        last_seen_at = CASE
          WHEN EXCLUDED.last_ip IS NOT NULL THEN NOW()
          ELSE axsuck.players.last_seen_at
        END
    `, [id, flag || 'cn', team || '', link || '', battleTags || '{}', lastIp]);
    
    return getById(id);
  }

  async function touch(id) {
    await db.query(`
      INSERT INTO axsuck.players (id, last_seen_at)
      VALUES ($1, NOW())
      ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW()
    `, [id]);
    return getById(id);
  }

  async function getTournaments(playerId) {
    const res = await db.query(`
      SELECT t.*, tp.seed, tp.registered_at
      FROM axsuck.tournament_players tp
      JOIN axsuck.tournaments t ON t.id = tp.tournament_id
      WHERE tp.player_id = $1
      ORDER BY t.created_at DESC
    `, [playerId]);
    return res.rows;
  }

  async function list() {
    const res = await db.query(`SELECT * FROM axsuck.players`);
    return res.rows.map(p => ({
      ...p,
      display_name: getPlayerDisplayName(p)
    })).sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  return { getById, upsert, touch, getTournaments, list };
}
