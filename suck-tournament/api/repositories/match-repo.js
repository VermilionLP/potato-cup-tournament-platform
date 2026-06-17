export function MatchRepo(db) {
  function getById(id) {
    return db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
  }

  function getByTournament(tournamentId) {
    return db.prepare(`
      SELECT * FROM matches WHERE tournament_id = ? ORDER BY round DESC, position ASC
    `).all(tournamentId);
  }

  function getNextPosition(tournamentId, round) {
    const last = db.prepare(`
      SELECT COALESCE(MAX(position), 0) as pos FROM matches
      WHERE tournament_id = ? AND round = ?
    `).get(tournamentId, round);
    return last.pos + 1;
  }

  function create({ tournament_id, round, position, player1_id, player2_id }) {
    const stmt = db.prepare(`
      INSERT INTO matches (tournament_id, round, position, player1_id, player2_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(tournament_id, round, position, player1_id || null, player2_id || null);
    return getById(info.lastInsertRowid);
  }

  function submitResult(id, score1, score2) {
    const match = getById(id);
    if (!match) throw new Error('Match not found');
    if (match.status === 'completed') throw new Error('Match already completed');

    let winnerId = null;
    if (score1 > score2) winnerId = match.player2_id; // the 0 side (player2) advances
    else if (score2 > score1) winnerId = match.player1_id; // the 0 side (player1) advances

    db.prepare(`
      UPDATE matches SET score1 = ?, score2 = ?, winner_id = ?, status = 'completed'
      WHERE id = ?
    `).run(score1, score2, winnerId, id);

    return getById(id);
  }

  function generateBracket(tournamentId) {
    const players = db.prepare(`
      SELECT p.id, tp.seed FROM tournament_players tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.tournament_id = ?
      ORDER BY tp.seed IS NULL, tp.seed ASC, tp.registered_at ASC
    `).all(tournamentId);

    if (players.length < 2) throw new Error('Need at least 2 players');

    // Automatically assign and compact seeds sequentially (1 to N)
    const updateTx = db.transaction(() => {
      players.forEach((p, idx) => {
        const targetSeed = idx + 1;
        if (p.seed !== targetSeed) {
          db.prepare(`
            UPDATE tournament_players SET seed = ?
            WHERE tournament_id = ? AND player_id = ?
          `).run(targetSeed, tournamentId, p.id);
          p.seed = targetSeed;
        }
      });
    });
    updateTx();

    db.prepare(`DELETE FROM matches WHERE tournament_id = ?`).run(tournamentId);

    const n = players.length;
    const size = 1 << Math.ceil(Math.log2(n));
    const totalRounds = Math.log2(size);

    const seedingOrder = getSeedingOrder(size);
    const slots = seedingOrder.map(seed => {
      const player = players.find(p => p.seed === seed);
      return player ? player.id : null;
    });

    const tx = db.transaction(() => {
      buildRounds(tournamentId, slots, totalRounds, db);
    });
    tx();

    return getByTournament(tournamentId);
  }

  function advanceWinner(tournamentId, matchId) {
    const match = getById(matchId);
    if (!match) throw new Error('Match not found');
    if ((match.status !== 'completed' && match.status !== 'walkover') || !match.winner_id) {
      throw new Error('Match not completed or no winner');
    }

    const nextRound = match.round - 1;
    if (nextRound < 1) return null; // final match

    const nextPosition = Math.ceil(match.position / 2);

    let nextMatch = db.prepare(`
      SELECT * FROM matches WHERE tournament_id = ? AND round = ? AND position = ?
    `).get(tournamentId, nextRound, nextPosition);

    if (!nextMatch) {
      const pos = getNextPosition(tournamentId, nextRound);
      const isPlayer1 = match.position % 2 === 1;
      nextMatch = create({
        tournament_id: tournamentId,
        round: nextRound,
        position: pos,
        player1_id: isPlayer1 ? match.winner_id : null,
        player2_id: !isPlayer1 ? match.winner_id : null
      });
    } else {
      const isPlayer1 = match.position % 2 === 1;
      if (isPlayer1) {
        db.prepare(`UPDATE matches SET player1_id = ? WHERE id = ?`).run(match.winner_id, nextMatch.id);
      } else {
        db.prepare(`UPDATE matches SET player2_id = ? WHERE id = ?`).run(match.winner_id, nextMatch.id);
      }
      nextMatch = getById(nextMatch.id);
    }

    return nextMatch;
  }

  function clearMatches(tournamentId) {
    db.prepare(`DELETE FROM matches WHERE tournament_id = ?`).run(tournamentId);
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
  // branchNum: 1 for player1's branch, 2 for player2's branch
  const len = 1 << (totalRounds - round);
  const startIdx = (pos - 1) * 2 * len + (branchNum - 1) * len;
  const endIdx = startIdx + len;
  const slice = slots.slice(startIdx, endIdx);
  return slice.every(player => player === null);
}

function buildRounds(tournamentId, slots, totalRounds, db) {
  let current = slots.slice();
  for (let round = totalRounds; round >= 1; round--) {
    const next = [];
    const stmt = db.prepare(`
      INSERT INTO matches (tournament_id, round, position, player1_id, player2_id, winner_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
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
        // p1 has a bye (opponent's branch is completely empty)
        winnerId = p1;
        status = 'completed';
        nextPlayer = p1;
      } else if (p2 && p1Empty) {
        // p2 has a bye (opponent's branch is completely empty)
        winnerId = p2;
        status = 'completed';
        nextPlayer = p2;
      } else if (p1 && p2) {
        // normal match with both players
        winnerId = null;
        status = 'pending';
        nextPlayer = null;
      } else {
        // TBD vs TBD or player vs TBD
        winnerId = null;
        status = 'pending';
        nextPlayer = null;
      }

      stmt.run(tournamentId, round, pos, p1 || null, p2 || null, winnerId, status);
      next.push(nextPlayer);
    }
    current = next;
  }
}

