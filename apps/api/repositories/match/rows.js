// Inserting generated bracket rows inside a bracket transaction (`client`):
// seeded entrants, single-elimination rounds, linked double-elimination /
// group rows and Swiss rounds.

import { SWISS_BRACKET } from '../../lib/swiss.js';

/** Entrants by seed, with seeds compacted to 1..N (written back). */
export async function loadSeededPlayers(client, tournamentId) {
  const playersRes = await client.query(`
    SELECT p.id, tp.seed FROM axsuck.tournament_players tp
    JOIN axsuck.players p ON p.id = tp.player_id
    WHERE tp.tournament_id = $1
    ORDER BY tp.seed IS NULL, tp.seed ASC, tp.registered_at ASC
  `, [tournamentId]);

  const players = playersRes.rows;
  // Automatically assign and compact seeds sequentially (1 to N).
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
  return players;
}

/** Stores each player's group (snake-seeded) before a group stage. */
export async function saveGroups(client, tournamentId, players, groups) {
  for (const p of players) {
    await client.query(`
      UPDATE axsuck.tournament_players SET swiss_group = $1
      WHERE tournament_id = $2 AND player_id = $3
    `, [groups.get(p.id), tournamentId, p.id]);
  }
}

// Inserts one Swiss round for one group. Positions are numbered across all
// groups of the round, continuing after the boards already in it.
export async function insertSwissRound(client, tournamentId, round, pairs, group = null) {
  const posRes = await client.query(`
    SELECT COALESCE(MAX(position), 0) AS max FROM axsuck.matches
    WHERE tournament_id = $1 AND bracket = $2 AND round = $3
  `, [tournamentId, SWISS_BRACKET, round]);
  let position = Number(posRes.rows[0]?.max) || 0;
  for (const pair of pairs) {
    position += 1;
    const isBye = !pair.player2_id;
    await client.query(`
      INSERT INTO axsuck.matches
        (tournament_id, round, position, bracket, player1_id, player2_id, winner_id, status, swiss_group)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      tournamentId,
      round,
      position,
      SWISS_BRACKET,
      pair.player1_id,
      pair.player2_id ?? null,
      isBye ? pair.player1_id : null,
      isBye ? 'completed' : 'pending',
      group,
    ]);
  }
}

/** Rows with keys and next / loser-next links (double elimination, group brackets). */
export async function insertDoubleElimRows(client, tournamentId, rows) {
  const idByKey = new Map();
  for (const row of rows) {
    const res = await client.query(`
      INSERT INTO axsuck.matches
        (tournament_id, round, position, bracket, player1_id, player2_id,
         winner_id, status, slot1_void, slot2_void, swiss_group)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      tournamentId,
      row.round,
      row.position,
      row.bracket,
      row.player1_id,
      row.player2_id,
      row.winner_id,
      row.status,
      row.slot1_void,
      row.slot2_void,
      row.swiss_group ?? null,
    ]);
    idByKey.set(row.key, res.rows[0].id);
  }
  for (const row of rows) {
    if (!row.next_key && !row.loser_next_key) continue;
    await client.query(`
      UPDATE axsuck.matches
      SET next_match_id = $1, next_slot = $2,
          loser_next_match_id = $3, loser_next_slot = $4
      WHERE id = $5
    `, [
      row.next_key ? idByKey.get(row.next_key) : null,
      row.next_slot ?? null,
      row.loser_next_key ? idByKey.get(row.loser_next_key) : null,
      row.loser_next_slot ?? null,
      idByKey.get(row.key),
    ]);
  }
}

function isBranchEmpty(slots, round, pos, branchNum, totalRounds) {
  const len = 1 << (totalRounds - round);
  const startIdx = (pos - 1) * 2 * len + (branchNum - 1) * len;
  const endIdx = startIdx + len;
  const slice = slots.slice(startIdx, endIdx);
  return slice.every(player => player === null);
}

/**
 * Single-elimination rounds (no links; winners move by round / position)
 * from seeded slots. A player whose opposite branch is empty gets a bye.
 */
export async function buildRounds(tournamentId, slots, totalRounds, runner) {
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
