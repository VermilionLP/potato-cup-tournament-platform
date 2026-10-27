import { describeBracket } from '../lib/bracket.js';
import {
  resolveDoubleElimRows,
  seedingOrder,
} from '../lib/double-elim.js';
import {
  currentSwissRound,
  effectiveSwissRounds,
  pairSwissRound,
  SWISS_BRACKET,
  swissRoundComplete,
} from '../lib/swiss.js';
import { assignGroups, groupCountFor } from '../lib/group-stage.js';
import { GROUP_BRACKETS, groupBracketRows } from '../lib/group-brackets.js';

// Matches of the group stage of a two-stage event (Swiss or group brackets);
// everything else is the playoff.
const GROUP_STAGE_BRACKETS = [SWISS_BRACKET, ...GROUP_BRACKETS];

export function MatchRepo(db) {
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

  async function submitResult(id, score1, score2) {
    const match = await getById(id);
    if (!match) throw new Error('Match not found');

    const tourneyRes = await db.query(
      'SELECT loser_advances, format, playoff_format FROM axsuck.tournaments WHERE id = $1',
      [match.tournament_id],
    );
    const tournament = tourneyRes.rows[0];
    // Double elimination always uses the higher score as the match winner: the
    // loser keeps playing in the losers bracket instead of "advancing" in its
    // place.
    const loserAdvances =
      !tournament?.playoff_format &&
      tournament?.format !== 'double_elim' &&
      tournament?.format !== 'swiss' &&
      (tournament ? tournament.loser_advances !== 0 : true);

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

  async function loadSeededPlayers(client, tournamentId) {
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

  async function generateBracket(tournamentId) {
    const info = await db.query(
      'SELECT format, playoff_format FROM axsuck.tournaments WHERE id = $1',
      [tournamentId],
    );
    if (info.rows[0]?.playoff_format && info.rows[0].format !== 'swiss') {
      return generateEliminationGroups(tournamentId);
    }
    if (info.rows[0]?.format === 'double_elim') {
      return generateDoubleElimBracket(tournamentId);
    }
    if (info.rows[0]?.format === 'swiss') {
      return generateSwissFirstRound(tournamentId);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const players = await loadSeededPlayers(client, tournamentId);
      if (players.length < 2) throw new Error('Need at least 2 players');

      await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);

      const n = players.length;
      const bracket = describeBracket(n);
      const size = bracket.size;
      const totalRounds = bracket.totalRounds;

      const order = seedingOrder(size);
      const slots = order.map((seed) => {
        const player = players.find((p) => p.seed === seed);
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

  async function generateDoubleElimBracket(tournamentId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const players = await loadSeededPlayers(client, tournamentId);
      if (players.length < 4) {
        throw new Error('双败淘汰赛至少需要 4 名选手');
      }

      const rows = resolveDoubleElimRows(players.map((p) => p.id));

      await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);
      await insertDoubleElimRows(client, tournamentId, rows);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return getByTournament(tournamentId);
  }

  // Inserts one Swiss round for one group. Positions are numbered across all
  // groups of the round, continuing after the boards already in it.
  async function insertSwissRound(client, tournamentId, round, pairs, group = null) {
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

  // Swiss round 1 is generated (and regenerated as a preview) like any other
  // bracket; later rounds are created as soon as the previous one finishes.
  // Two-stage events split the field into groups (snake order by seed) first.
  async function generateSwissFirstRound(tournamentId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const players = await loadSeededPlayers(client, tournamentId);
      if (players.length < 2) throw new Error('瑞士轮至少需要 2 名选手');
      const tRes = await client.query(
        'SELECT playoff_format, swiss_group_size, swiss_rounds FROM axsuck.tournaments WHERE id = $1',
        [tournamentId],
      );
      const t = tRes.rows[0] || {};
      const groupCount = t.playoff_format ? groupCountFor(players.length, t.swiss_group_size) : 1;
      const groups = assignGroups(players, groupCount);

      await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);
      await client.query(`UPDATE axsuck.tournaments SET current_stage = 'group' WHERE id = $1`, [tournamentId]);
      for (const p of players) {
        await client.query(`
          UPDATE axsuck.tournament_players SET swiss_group = $1
          WHERE tournament_id = $2 AND player_id = $3
        `, [groups.get(p.id), tournamentId, p.id]);
      }
      for (let g = 1; g <= groupCount; g += 1) {
        const own = players.filter((p) => groups.get(p.id) === g);
        const totalRounds = effectiveSwissRounds(t.swiss_rounds, own.length);
        await insertSwissRound(client, tournamentId, 1, pairSwissRound(own, [], 1, { totalRounds }), g);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return getByTournament(tournamentId);
  }

  /**
   * Creates the next Swiss round for every group whose current round is
   * finished and that has rounds left. Returns the lowest new round number,
   * or null. Serialised per tournament so two results finishing a round at the
   * same time cannot both create it.
   */
  async function advanceSwiss(tournamentId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`swiss:${tournamentId}`]);
      const tRes = await client.query(
        'SELECT swiss_rounds, current_stage FROM axsuck.tournaments WHERE id = $1',
        [tournamentId],
      );
      const storedRounds = tRes.rows[0]?.swiss_rounds ?? null;
      if (tRes.rows[0]?.current_stage === 'playoff') {
        await client.query('COMMIT');
        return null;
      }
      const mRes = await client.query(
        'SELECT * FROM axsuck.matches WHERE tournament_id = $1 AND bracket = $2',
        [tournamentId, SWISS_BRACKET],
      );
      const pRes = await client.query(`
        SELECT player_id AS id, seed, swiss_group FROM axsuck.tournament_players
        WHERE tournament_id = $1
        ORDER BY seed IS NULL, seed ASC, registered_at ASC
      `, [tournamentId]);
      const groupIds = [...new Set(pRes.rows.map((p) => p.swiss_group || 1))].sort((a, b) => a - b);
      let created = null;
      for (const g of groupIds) {
        const own = mRes.rows.filter((m) => (m.swiss_group || 1) === g);
        const ownPlayers = pRes.rows.filter((p) => (p.swiss_group || 1) === g);
        const totalRounds = effectiveSwissRounds(storedRounds, ownPlayers.length);
        const round = currentSwissRound(own);
        if (round === 0 || round >= totalRounds || !swissRoundComplete(own, round)) continue;
        const groupValue = own[0]?.swiss_group ?? null;
        await insertSwissRound(
          client,
          tournamentId,
          round + 1,
          pairSwissRound(ownPlayers, own, round + 1, { totalRounds }),
          groupValue,
        );
        created = created === null ? round + 1 : Math.min(created, round + 1);
      }
      await client.query('COMMIT');
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Two-stage events with elimination groups: snake-seeded groups, each
  // playing its own single- or double-elimination bracket.
  async function generateEliminationGroups(tournamentId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const players = await loadSeededPlayers(client, tournamentId);
      const tRes = await client.query(
        'SELECT format, swiss_group_size, advance_per_group FROM axsuck.tournaments WHERE id = $1',
        [tournamentId],
      );
      const t = tRes.rows[0] || {};
      const groupCount = groupCountFor(players.length, t.swiss_group_size);
      const groups = assignGroups(players, groupCount);

      await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);
      await client.query(`UPDATE axsuck.tournaments SET current_stage = 'group' WHERE id = $1`, [tournamentId]);
      for (const p of players) {
        await client.query(`
          UPDATE axsuck.tournament_players SET swiss_group = $1
          WHERE tournament_id = $2 AND player_id = $3
        `, [groups.get(p.id), tournamentId, p.id]);
      }
      for (let g = 1; g <= groupCount; g += 1) {
        const own = players.filter((p) => groups.get(p.id) === g).map((p) => p.id);
        await insertDoubleElimRows(client, tournamentId, groupBracketRows(t.format, own, t.advance_per_group, g));
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return getByTournament(tournamentId);
  }

  async function insertDoubleElimRows(client, tournamentId, rows) {
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

  /**
   * Builds the playoff of a two-stage event from qualifier ids in seed order.
   * Group-stage matches are kept; any previous playoff is replaced.
   */
  async function generatePlayoffs(tournamentId, seededIds, format) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE axsuck.tournaments SET active_match_id = NULL
        WHERE id = $1 AND active_match_id IN (
          SELECT id FROM axsuck.matches WHERE tournament_id = $1 AND bracket <> ALL($2::text[]))
      `, [tournamentId, GROUP_STAGE_BRACKETS]);
      await client.query(
        'DELETE FROM axsuck.matches WHERE tournament_id = $1 AND bracket <> ALL($2::text[])',
        [tournamentId, GROUP_STAGE_BRACKETS],
      );
      if (format === 'double_elim') {
        await insertDoubleElimRows(client, tournamentId, resolveDoubleElimRows(seededIds));
      } else {
        const bracket = describeBracket(seededIds.length);
        const slots = seedingOrder(bracket.size).map((seed) => seededIds[seed - 1] ?? null);
        await buildRounds(tournamentId, slots, bracket.totalRounds, client);
      }
      await client.query(`UPDATE axsuck.tournaments SET current_stage = 'playoff' WHERE id = $1`, [tournamentId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return getByTournament(tournamentId);
  }

  /** Removes the playoff and returns a two-stage event to its group stage. */
  async function clearPlayoffs(tournamentId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE axsuck.tournaments SET active_match_id = NULL
        WHERE id = $1 AND active_match_id IN (
          SELECT id FROM axsuck.matches WHERE tournament_id = $1 AND bracket <> ALL($2::text[]))
      `, [tournamentId, GROUP_STAGE_BRACKETS]);
      await client.query(
        'DELETE FROM axsuck.matches WHERE tournament_id = $1 AND bracket <> ALL($2::text[])',
        [tournamentId, GROUP_STAGE_BRACKETS],
      );
      await client.query(`UPDATE axsuck.tournaments SET current_stage = 'group' WHERE id = $1`, [tournamentId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function advanceWinner(tournamentId, matchId) {
    const match = await getById(matchId);
    if (!match) throw new Error('Match not found');
    if ((match.status !== 'completed' && match.status !== 'walkover') || !match.winner_id) {
      throw new Error('Match not completed or no winner');
    }

    // Swiss results do not move anyone forward; they may complete the round.
    if (match.bracket === SWISS_BRACKET) {
      const nextRound = await advanceSwiss(tournamentId);
      return nextRound ? { swiss_round_created: nextRound } : null;
    }

    const resetMatch = await maybeCreateResetMatch(tournamentId, match);

    if (match.next_match_id || match.loser_next_match_id) {
      const loserId = match.winner_id === match.player1_id
        ? match.player2_id
        : match.player1_id;
      await propagateOutcome(match, match.winner_id, loserId || null, 0);
      return resetMatch;
    }

    // Legacy single-elimination brackets have no explicit links.
    const nextRound = match.round - 1;
    if (nextRound < 1) return resetMatch; // final match

    const nextPosition = Math.ceil(match.position / 2);

    const nextRes = await db.query(`
      SELECT * FROM axsuck.matches
      WHERE tournament_id = $1 AND bracket = 'main' AND round = $2 AND position = $3
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

  // Fills a slot in a linked match; the loser of a bye arrives as null and is
  // remembered as a void slot so a later result can auto-advance.
  async function fillLinkedSlot(matchId, slot, playerId, depth) {
    if (!matchId || (slot !== 1 && slot !== 2)) return;
    const playerColumn = slot === 1 ? 'player1_id' : 'player2_id';
    const voidColumn = slot === 1 ? 'slot1_void' : 'slot2_void';
    await db.query(`
      UPDATE axsuck.matches SET ${playerColumn} = $1, ${voidColumn} = $2 WHERE id = $3
    `, [playerId ?? null, playerId == null, matchId]);
    await settleWalkover(matchId, depth + 1);
  }

  async function propagateOutcome(match, winnerId, loserId, depth) {
    if (match.next_match_id && match.next_slot) {
      await fillLinkedSlot(match.next_match_id, match.next_slot, winnerId, depth);
    }
    if (match.loser_next_match_id && match.loser_next_slot) {
      await fillLinkedSlot(match.loser_next_match_id, match.loser_next_slot, loserId, depth);
    }
  }

  // A match whose only possible opponent came from a bye is a walkover.
  async function settleWalkover(matchId, depth = 0) {
    if (depth > 64) return;
    const m = await getById(matchId);
    if (!m || m.status !== 'pending') return;

    const slot1Ready = Boolean(m.player1_id) || m.slot1_void;
    const slot2Ready = Boolean(m.player2_id) || m.slot2_void;
    if (!slot1Ready || !slot2Ready) return;

    const filled = [m.player1_id, m.player2_id].filter(Boolean);
    if (filled.length === 2) return;

    const winnerId = filled[0] ?? null;
    await db.query(`
      UPDATE axsuck.matches
      SET status = 'completed', winner_id = $1, score1 = 0, score2 = 0
      WHERE id = $2
    `, [winnerId, matchId]);

    const updated = await getById(matchId);
    await propagateOutcome(updated, winnerId, null, depth);
  }

  // With bracket reset enabled, a losers-bracket champion who wins the first
  // grand final forces one more match. The reset match is created on demand so
  // brackets that end 2-0 never show an empty extra final.
  async function maybeCreateResetMatch(tournamentId, match) {
    if (match.bracket !== 'gf' || match.position !== 1) return null;

    const info = await db.query(
      'SELECT format, playoff_format, grand_final_reset FROM axsuck.tournaments WHERE id = $1',
      [tournamentId],
    );
    const tournament = info.rows[0];
    const doubleElim = tournament?.format === 'double_elim' || tournament?.playoff_format === 'double_elim';
    if (!tournament || !doubleElim || !tournament.grand_final_reset) {
      return null;
    }

    const existing = await db.query(`
      SELECT * FROM axsuck.matches
      WHERE tournament_id = $1 AND bracket = 'gf' AND position = 2
    `, [tournamentId]);
    if (existing.rowCount) {
      const reset = existing.rows[0];
      if (match.winner_id !== match.player2_id) {
        // The winners-bracket champion closed it out: no reset match is needed.
        await db.query('DELETE FROM axsuck.matches WHERE id = $1', [reset.id]);
        return null;
      }
      // Re-reporting the first final reopens the reset match with a clean slate.
      await db.query(`
        UPDATE axsuck.matches
        SET player1_id = $1, player2_id = $2, score1 = 0, score2 = 0,
            winner_id = NULL, status = 'pending'
        WHERE id = $3
      `, [match.player1_id, match.player2_id, reset.id]);
      return await getById(reset.id);
    }

    // Slot 2 of the first grand final is the losers-bracket champion: only a
    // win from that side forces the extra match.
    if (match.winner_id !== match.player2_id) return null;

    const res = await db.query(`
      INSERT INTO axsuck.matches
        (tournament_id, round, position, bracket, player1_id, player2_id, status)
      VALUES ($1, 1, 2, 'gf', $2, $3, 'pending')
      RETURNING *
    `, [tournamentId, match.player1_id, match.player2_id]);
    return res.rows[0];
  }

  async function clearMatches(tournamentId) {
    await db.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);
  }

  return { getById, getByTournament, create, submitResult, generateBracket, advanceWinner, advanceSwiss, generatePlayoffs, clearPlayoffs, clearMatches };
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
