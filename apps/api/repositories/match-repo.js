import { describeBracket } from '../lib/bracket.js';

export function MatchRepo(db) {
  async function getById(id, runner = db) {
    const res = await runner.query('SELECT * FROM axsuck.matches WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async function getByTournament(tournamentId, runner = db) {
    const res = await runner.query(`
      SELECT * FROM axsuck.matches WHERE tournament_id = $1 ORDER BY round DESC, position ASC
    `, [tournamentId]);
    return res.rows;
  }

  async function getNextPosition(tournamentId, round, runner = db) {
    const res = await runner.query(`
      SELECT COALESCE(MAX(position), 0) as pos FROM axsuck.matches
      WHERE tournament_id = $1 AND round = $2
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

  async function submitResult(id, score1, score2) {
    const match = await getById(id);
    if (!match) throw new Error('Match not found');

    const tourneyRes = await db.query('SELECT loser_advances FROM axsuck.tournaments WHERE id = $1', [match.tournament_id]);
    const tournament = tourneyRes.rows[0];
    const loserAdvances = tournament ? (tournament.loser_advances !== 0) : true;

    let winnerId = null;
    if (score1 > score2) {
      winnerId = loserAdvances ? match.player2_id : match.player1_id;
    } else if (score2 > score1) {
      winnerId = loserAdvances ? match.player1_id : match.player2_id;
    }

    const updateRes = await db.query(`
      UPDATE axsuck.matches SET score1 = $1, score2 = $2, winner_id = $3, status = 'completed'
      WHERE id = $4
      RETURNING *
    `, [score1, score2, winnerId, id]);

    return updateRes.rows[0];
  }

  async function generateBracket(tournamentId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const playersRes = await client.query(`
        SELECT p.id, tp.seed FROM axsuck.tournament_players tp
        JOIN axsuck.players p ON p.id = tp.player_id
        WHERE tp.tournament_id = $1
        ORDER BY tp.seed IS NULL, tp.seed ASC, tp.registered_at ASC
      `, [tournamentId]);

      const players = playersRes.rows;
      if (players.length < 2) throw new Error('Need at least 2 players');

      // Automatically assign and compact seeds sequentially (1 to N)
      for (let idx = 0; idx < players.length; idx++) {
        const p = players[idx];
        const targetSeed = idx + 1;
        if (p.seed !== targetSeed) {
          await client.query(`
            UPDATE axsuck.tournament_players SET seed = $1
            WHERE tournament_id = $2 AND player_id = $3
          `, [targetSeed, tournamentId, p.id]);
          p.seed = targetSeed;
        }
      }

      await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);

      const n = players.length;
      const bracket = describeBracket(n);
      const size = bracket.size;
      const totalRounds = bracket.totalRounds;

      const seedingOrder = getSeedingOrder(size);
      const slots = seedingOrder.map(seed => {
        const player = players.find(p => p.seed === seed);
        return player ? player.id : null;
      });

      await buildRounds(tournamentId, slots, totalRounds, client);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return getByTournament(tournamentId);
  }

  async function advanceWinner(tournamentId, matchId) {
    const match = await getById(matchId);
    if (!match) throw new Error('Match not found');
    if ((match.status !== 'completed' && match.status !== 'walkover') || !match.winner_id) {
      throw new Error('Match not completed or no winner');
    }

    const nextRound = match.round - 1;
    if (nextRound < 1) return null; // final match

    const nextPosition = Math.ceil(match.position / 2);

    const nextRes = await db.query(`
      SELECT * FROM axsuck.matches WHERE tournament_id = $1 AND round = $2 AND position = $3
    `, [tournamentId, nextRound, nextPosition]);
    let nextMatch = nextRes.rows[0] || null;

    if (!nextMatch) {
      const pos = await getNextPosition(tournamentId, nextRound);
      const isPlayer1 = match.position % 2 === 1;
      nextMatch = await create({
        tournament_id: tournamentId,
        round: nextRound,
        position: pos,
        player1_id: isPlayer1 ? match.winner_id : null,
        player2_id: !isPlayer1 ? match.winner_id : null
      });
    } else {
      const isPlayer1 = match.position % 2 === 1;
      if (isPlayer1) {
        await db.query('UPDATE axsuck.matches SET player1_id = $1 WHERE id = $2', [match.winner_id, nextMatch.id]);
      } else {
        await db.query('UPDATE axsuck.matches SET player2_id = $1 WHERE id = $2', [match.winner_id, nextMatch.id]);
      }
      nextMatch = await getById(nextMatch.id);
    }

    return nextMatch;
  }

  async function clearMatches(tournamentId) {
    await db.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);
  }

  return { getById, getByTournament, create, submitResult, generateBracket, advanceWinner, clearMatches };
}

function getSeedingOrder(size) {
  if (size <= 2) return [1, 2];
  const half = getSeedingOrder(size / 2);
  const result = [];
  for (let i = 0; i < half.length; i++) {
    result.push(half[i]);
    result.push(size + 1 - half[i]);
  }
  return result;
}

function isBranchEmpty(slots, round, pos, branchNum, totalRounds) {
  const len = 1 << (totalRounds - round);
  const startIdx = (pos - 1) * 2 * len + (branchNum - 1) * len;
  const endIdx = startIdx + len;
  const slice = slots.slice(startIdx, endIdx);
  return slice.every(player => player === null);
}

async function buildRounds(tournamentId, slots, totalRounds, runner) {
  let current = slots.slice();
  for (let round = totalRounds; round >= 1; round--) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const p1 = current[i];
      const p2 = current[i + 1];
      const pos = (i / 2) + 1;

      let winnerId = null;
      let status = 'pending';
      let nextPlayer = null;

      const p1Empty = isBranchEmpty(slots, round, pos, 1, totalRounds);
      const p2Empty = isBranchEmpty(slots, round, pos, 2, totalRounds);

      if (p1 && p2Empty) {
        winnerId = p1;
        status = 'completed';
        nextPlayer = p1;
      } else if (p2 && p1Empty) {
        winnerId = p2;
        status = 'completed';
        nextPlayer = p2;
      } else if (p1 && p2) {
        winnerId = null;
        status = 'pending';
        nextPlayer = null;
      } else {
        winnerId = null;
        status = 'pending';
        nextPlayer = null;
      }

      await runner.query(`
        INSERT INTO axsuck.matches (tournament_id, round, position, player1_id, player2_id, winner_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [tournamentId, round, pos, p1 || null, p2 || null, winnerId, status]);

      next.push(nextPlayer);
    }
    current = next;
  }
}
