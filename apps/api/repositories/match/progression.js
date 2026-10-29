// Results moving through a bracket: recording a score, sending the winner
// (and the loser, in double elimination) on, settling walkovers against
// byes, and the grand final reset.

import { SWISS_BRACKET } from '../../lib/swiss.js';

export function matchProgression(db, { getById, getNextPosition, create }, { advanceSwiss }) {
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

    const isPlayer1 = match.position % 2 === 1;
    if (!nextMatch) {
      const pos = await getNextPosition(tournamentId, nextRound);
      nextMatch = await create({
        tournament_id: tournamentId,
        round: nextRound,
        position: pos,
        player1_id: isPlayer1 ? match.winner_id : null,
        player2_id: !isPlayer1 ? match.winner_id : null
      });
    } else {
      const column = isPlayer1 ? 'player1_id' : 'player2_id';
      await db.query(`UPDATE axsuck.matches SET ${column} = $1 WHERE id = $2`, [match.winner_id, nextMatch.id]);
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

  return { submitResult, advanceWinner };
}
