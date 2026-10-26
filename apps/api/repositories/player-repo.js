export function getPlayerDisplayName(player) {
  if (!player) return '';
  return player.id;
}

/**
 * Moves everything of player oldId onto targetId and deletes oldId: event
 * registrations, time and custom votes, per-event accounts, matches and
 * bnet ids. The target keeps its own flag/team unless it has none. Runs on
 * a client inside the caller's transaction.
 */
export async function mergePlayerInto(client, oldId, targetId) {
  if (oldId === targetId) throw new Error('Cannot merge a player into themselves');
  const one = async (sql, params) => (await client.query(sql, params)).rows[0] || null;
  const oldPlayer = await one('SELECT * FROM axsuck.players WHERE id = $1', [oldId]);
  const targetPlayer = await one('SELECT * FROM axsuck.players WHERE id = $1', [targetId]);
  if (!oldPlayer) throw new Error(`Source player not found: ${oldId}`);
  if (!targetPlayer) throw new Error(`Target player not found: ${targetId}`);

  // 1. Event registrations (the target's own entry wins in a shared event).
  await client.query(`
    DELETE FROM axsuck.tournament_players o
    WHERE o.player_id = $1
      AND EXISTS (SELECT 1 FROM axsuck.tournament_players t
                  WHERE t.tournament_id = o.tournament_id AND t.player_id = $2)
  `, [oldId, targetId]);
  await client.query('UPDATE axsuck.tournament_players SET player_id = $2 WHERE player_id = $1', [oldId, targetId]);

  // 2. Time votes and 3. custom votes (drop exact duplicates first).
  await client.query(`
    DELETE FROM axsuck.time_votes o
    WHERE o.player_id = $1
      AND EXISTS (SELECT 1 FROM axsuck.time_votes t
                  WHERE t.tournament_id = o.tournament_id AND t.player_id = $2 AND t.proposed_time = o.proposed_time)
  `, [oldId, targetId]);
  await client.query('UPDATE axsuck.time_votes SET player_id = $2 WHERE player_id = $1', [oldId, targetId]);
  await client.query(`
    DELETE FROM axsuck.custom_votes o
    WHERE o.player_id = $1
      AND EXISTS (SELECT 1 FROM axsuck.custom_votes t
                  WHERE t.tournament_id = o.tournament_id AND t.player_id = $2
                    AND t.topic = o.topic AND t.value = o.value)
  `, [oldId, targetId]);
  await client.query('UPDATE axsuck.custom_votes SET player_id = $2 WHERE player_id = $1', [oldId, targetId]);

  // 4. Per-event accounts.
  await client.query('UPDATE axsuck.tournament_player_accounts SET player_id = $2 WHERE player_id = $1', [oldId, targetId]);

  // 5. Matches.
  await client.query('UPDATE axsuck.matches SET player1_id = $2 WHERE player1_id = $1', [oldId, targetId]);
  await client.query('UPDATE axsuck.matches SET player2_id = $2 WHERE player2_id = $1', [oldId, targetId]);
  await client.query('UPDATE axsuck.matches SET winner_id = $2 WHERE winner_id = $1', [oldId, targetId]);

  // 6. bnet ids, flag and team.
  const parse = (v) => {
    try {
      return typeof v === 'string' ? JSON.parse(v || '[]') : (v || []);
    } catch {
      return [];
    }
  };
  const key = (item) => (typeof item === 'string' ? item : item?.id);
  const merged = [...parse(targetPlayer.bnet_ids)];
  for (const item of parse(oldPlayer.bnet_ids)) {
    if (!merged.some((t) => key(t) === key(item))) merged.push(item);
  }
  await client.query(`
    UPDATE axsuck.players
    SET bnet_ids = $2,
        flag = COALESCE(NULLIF(flag, ''), NULLIF($3, '')),
        team = COALESCE(NULLIF(team, ''), $4, '')
    WHERE id = $1
  `, [targetId, JSON.stringify(merged), oldPlayer.flag || '', oldPlayer.team || '']);

  // 7. The old player.
  await client.query('DELETE FROM axsuck.players WHERE id = $1', [oldId]);
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
