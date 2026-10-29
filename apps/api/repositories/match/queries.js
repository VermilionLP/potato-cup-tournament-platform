// Plain match reads and writes shared by bracket generation and results.

export function matchQueries(db) {
  async function getById(id, runner = db) {
    const res = await runner.query('SELECT * FROM axsuck.matches WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async function getByTournament(tournamentId, runner = db) {
    const res = await runner.query(`
      SELECT * FROM axsuck.matches
      WHERE tournament_id = $1
      ORDER BY
        CASE bracket
          WHEN 'main' THEN 0
          WHEN 'wb' THEN 0
          WHEN 'lb' THEN 1
          WHEN 'gf' THEN 2
          ELSE 3
        END,
        round DESC,
        position ASC
    `, [tournamentId]);
    return res.rows;
  }

  async function getNextPosition(tournamentId, round, runner = db) {
    const res = await runner.query(`
      SELECT COALESCE(MAX(position), 0) as pos FROM axsuck.matches
      WHERE tournament_id = $1 AND round = $2 AND bracket = 'main'
    `, [tournamentId, round]);
    return (res.rows[0]?.pos || 0) + 1;
  }

  async function create({ tournament_id, round, position, player1_id, player2_id }, runner = db) {
    const res = await runner.query(`
      INSERT INTO axsuck.matches (tournament_id, round, position, player1_id, player2_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [tournament_id, round, position, player1_id || null, player2_id || null]);
    return res.rows[0];
  }

  async function clearMatches(tournamentId) {
    await db.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);
  }

  return { getById, getByTournament, getNextPosition, create, clearMatches };
}
