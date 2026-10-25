import { getPlayerDisplayName } from './player-repo.js';

export function CustomVoteRepo(db) {
  async function getByTournament(tournamentId) {
    const res = await db.query(`
      SELECT cv.*, p.battle_tags, p.id AS player_id
      FROM axsuck.custom_votes cv
      JOIN axsuck.players p ON p.id = cv.player_id
      WHERE cv.tournament_id = $1
      ORDER BY cv.topic ASC, cv.value ASC, cv.created_at ASC
    `, [tournamentId]);

    return res.rows.map(row => ({
      ...row,
      display_name: getPlayerDisplayName({ id: row.player_id, battle_tags: row.battle_tags })
    }));
  }

  async function upsert(tournamentId, playerId, topic, value) {
    await db.query(`
      INSERT INTO axsuck.players (id) VALUES ($1)
      ON CONFLICT (id) DO NOTHING
    `, [playerId]);

    await db.query(`
      INSERT INTO axsuck.custom_votes (tournament_id, player_id, topic, value)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [tournamentId, playerId, topic, value]);

    const res = await db.query(`
      SELECT cv.*, p.battle_tags, p.id AS player_id
      FROM axsuck.custom_votes cv
      JOIN axsuck.players p ON p.id = cv.player_id
      WHERE cv.tournament_id = $1 AND cv.player_id = $2 AND cv.topic = $3 AND cv.value = $4
    `, [tournamentId, playerId, topic, value]);

    const row = res.rows[0];
    if (!row) return null;
    return {
      ...row,
      display_name: getPlayerDisplayName({ id: row.player_id, battle_tags: row.battle_tags })
    };
  }

  async function removeVote(tournamentId, playerId, topic, value) {
    if (topic && value) {
      await db.query(`
        DELETE FROM axsuck.custom_votes 
        WHERE tournament_id = $1 AND player_id = $2 AND topic = $3 AND value = $4
      `, [tournamentId, playerId, topic, value]);
    } else if (topic) {
      await db.query(`
        DELETE FROM axsuck.custom_votes 
        WHERE tournament_id = $1 AND player_id = $2 AND topic = $3
      `, [tournamentId, playerId, topic]);
    } else {
      await db.query(`
        DELETE FROM axsuck.custom_votes 
        WHERE tournament_id = $1 AND player_id = $2
      `, [tournamentId, playerId]);
    }
  }

  async function clearByTournament(tournamentId) {
    await db.query('DELETE FROM axsuck.custom_votes WHERE tournament_id = $1', [tournamentId]);
  }

  return { getByTournament, upsert, removeVote, clearByTournament };
}
