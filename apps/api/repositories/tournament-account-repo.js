export function TournamentAccountRepo(db) {
  async function listByTournament(tournamentId) {
    const res = await db.query(`
      SELECT * FROM axsuck.tournament_player_accounts
      WHERE tournament_id = $1
      ORDER BY player_id, created_at
    `, [tournamentId]);
    return res.rows;
  }

  async function listAll() {
    const res = await db.query(`SELECT * FROM axsuck.tournament_player_accounts`);
    return res.rows;
  }

  async function getByKey(tournamentId, accountKey) {
    const res = await db.query(`
      SELECT * FROM axsuck.tournament_player_accounts
      WHERE tournament_id = $1 AND account_key = $2
    `, [tournamentId, accountKey]);
    return res.rows[0] || null;
  }

  // Upsert links. When `onlyIfUnclaimed` is true, an existing link to a
  // different player is left untouched (used by auto-linking).
  async function upsertMany(tournamentId, accounts, { onlyIfUnclaimed = false } = {}) {
    const applied = [];
    for (const a of accounts) {
      if (!a || !a.account_key || !a.player_id) continue;
      if (onlyIfUnclaimed) {
        const existing = await getByKey(tournamentId, a.account_key);
        if (existing && existing.player_id !== a.player_id) continue;
      }
      await db.query(`
        INSERT INTO axsuck.tournament_player_accounts
          (tournament_id, account_key, player_id, account_name, url, toon_handle, region, subregion)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tournament_id, account_key) DO UPDATE SET
          player_id = EXCLUDED.player_id,
          account_name = CASE WHEN EXCLUDED.account_name <> '' THEN EXCLUDED.account_name ELSE axsuck.tournament_player_accounts.account_name END,
          url = CASE WHEN EXCLUDED.url <> '' THEN EXCLUDED.url ELSE axsuck.tournament_player_accounts.url END,
          toon_handle = COALESCE(EXCLUDED.toon_handle, axsuck.tournament_player_accounts.toon_handle),
          region = COALESCE(EXCLUDED.region, axsuck.tournament_player_accounts.region),
          subregion = COALESCE(EXCLUDED.subregion, axsuck.tournament_player_accounts.subregion)
      `, [
        tournamentId,
        a.account_key,
        a.player_id,
        a.account_name || '',
        a.url || '',
        a.toon_handle || null,
        a.region || null,
        a.subregion != null ? a.subregion : null
      ]);
      applied.push(a.account_key);
    }
    return applied;
  }

  async function remove(tournamentId, accountKey) {
    const res = await db.query(`
      DELETE FROM axsuck.tournament_player_accounts
      WHERE tournament_id = $1 AND account_key = $2
    `, [tournamentId, accountKey]);
    return res.rowCount;
  }

  return { listByTournament, listAll, getByKey, upsertMany, remove };
}
