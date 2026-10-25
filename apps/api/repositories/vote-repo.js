import { getPlayerDisplayName } from './player-repo.js';

export function VoteRepo(db) {
  async function getByTournament(tournamentId) {
    const res = await db.query(`
      SELECT tv.*, p.battle_tags, p.id AS player_id
      FROM axsuck.time_votes tv
      JOIN axsuck.players p ON p.id = tv.player_id
      WHERE tv.tournament_id = $1
      ORDER BY tv.proposed_time ASC, tv.created_at ASC
    `, [tournamentId]);

    return res.rows.map(row => ({
      ...row,
      display_name: getPlayerDisplayName({ id: row.player_id, battle_tags: row.battle_tags })
    }));
  }

  async function upsert(tournamentId, playerId, proposedTime) {
    await db.query(`
      INSERT INTO axsuck.players (id) VALUES ($1)
      ON CONFLICT (id) DO NOTHING
    `, [playerId]);

    await db.query(`
      INSERT INTO axsuck.time_votes (tournament_id, player_id, proposed_time)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [tournamentId, playerId, proposedTime]);

    const res = await db.query(`
      SELECT tv.*, p.battle_tags, p.id AS player_id
      FROM axsuck.time_votes tv
      JOIN axsuck.players p ON p.id = tv.player_id
      WHERE tv.tournament_id = $1 AND tv.player_id = $2 AND tv.proposed_time = $3
    `, [tournamentId, playerId, proposedTime]);

    const row = res.rows[0];
    if (!row) return null;
    return {
      ...row,
      display_name: getPlayerDisplayName({ id: row.player_id, battle_tags: row.battle_tags })
    };
  }

  async function removeVote(tournamentId, playerId, proposedTime) {
    if (proposedTime) {
      await db.query(`
        DELETE FROM axsuck.time_votes WHERE tournament_id = $1 AND player_id = $2 AND proposed_time = $3
      `, [tournamentId, playerId, proposedTime]);
    } else {
      await db.query(`
        DELETE FROM axsuck.time_votes WHERE tournament_id = $1 AND player_id = $2
      `, [tournamentId, playerId]);
    }
  }

  async function clearByTournament(tournamentId) {
    await db.query('DELETE FROM axsuck.time_votes WHERE tournament_id = $1', [tournamentId]);
  }

  async function deletePast(tournamentId) {
    const res = await db.query(`
      DELETE FROM axsuck.time_votes
      WHERE tournament_id = $1
        AND (proposed_time::timestamp AT TIME ZONE 'Asia/Shanghai') < NOW()
    `, [tournamentId]);
    return res.rowCount || 0;
  }

  return { getByTournament, upsert, removeVote, clearByTournament, deletePast };
}
