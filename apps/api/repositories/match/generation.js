// Bracket generation: single / double elimination, Swiss (round 1 and the
// rounds after), elimination groups, and the playoff of two-stage events.

import { describeBracket } from '../../lib/bracket.js';
import { resolveDoubleElimRows, seedingOrder } from '../../lib/double-elim.js';
import {
  currentSwissRound,
  effectiveSwissRounds,
  pairSwissRound,
  SWISS_BRACKET,
  swissRoundComplete,
} from '../../lib/swiss.js';
import { assignGroups, groupCountFor } from '../../lib/group-stage.js';
import { GROUP_BRACKETS, groupBracketRows } from '../../lib/group-brackets.js';
import { inTransaction } from './transaction.js';
import { buildRounds, insertDoubleElimRows, insertSwissRound, loadSeededPlayers, saveGroups } from './rows.js';

// Matches of the group stage of a two-stage event (Swiss or group brackets);
// everything else is the playoff.
const GROUP_STAGE_BRACKETS = [SWISS_BRACKET, ...GROUP_BRACKETS];

export function matchGeneration(db, { getByTournament }) {
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

    await inTransaction(db, async (client) => {
      const players = await loadSeededPlayers(client, tournamentId);
      if (players.length < 2) throw new Error('Need at least 2 players');

      await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);

      const bracket = describeBracket(players.length);
      const slots = seedingOrder(bracket.size).map((seed) => {
        const player = players.find((p) => p.seed === seed);
        return player ? player.id : null;
      });
      await buildRounds(tournamentId, slots, bracket.totalRounds, client);
    });
    return getByTournament(tournamentId);
  }

  async function generateDoubleElimBracket(tournamentId) {
    await inTransaction(db, async (client) => {
      const players = await loadSeededPlayers(client, tournamentId);
      if (players.length < 4) {
        throw new Error('双败淘汰赛至少需要 4 名选手');
      }
      const rows = resolveDoubleElimRows(players.map((p) => p.id));
      await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [tournamentId]);
      await insertDoubleElimRows(client, tournamentId, rows);
    });
    return getByTournament(tournamentId);
  }

  // Swiss round 1 is generated (and regenerated as a preview) like any other
  // bracket; later rounds are created as soon as the previous one finishes.
  // Two-stage events split the field into groups (snake order by seed) first.
  async function generateSwissFirstRound(tournamentId) {
    await inTransaction(db, async (client) => {
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
      await saveGroups(client, tournamentId, players, groups);
      for (let g = 1; g <= groupCount; g += 1) {
        const own = players.filter((p) => groups.get(p.id) === g);
        const totalRounds = effectiveSwissRounds(t.swiss_rounds, own.length);
        await insertSwissRound(client, tournamentId, 1, pairSwissRound(own, [], 1, { totalRounds }), g);
      }
    });
    return getByTournament(tournamentId);
  }

  /**
   * Creates the next Swiss round for every group whose current round is
   * finished and that has rounds left. Returns the lowest new round number,
   * or null. Serialised per tournament so two results finishing a round at the
   * same time cannot both create it.
   */
  async function advanceSwiss(tournamentId) {
    return inTransaction(db, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`swiss:${tournamentId}`]);
      const tRes = await client.query(
        'SELECT swiss_rounds, current_stage FROM axsuck.tournaments WHERE id = $1',
        [tournamentId],
      );
      const storedRounds = tRes.rows[0]?.swiss_rounds ?? null;
      if (tRes.rows[0]?.current_stage === 'playoff') return null;
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
      return created;
    });
  }

  // Two-stage events with elimination groups: snake-seeded groups, each
  // playing its own single- or double-elimination bracket.
  async function generateEliminationGroups(tournamentId) {
    await inTransaction(db, async (client) => {
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
      await saveGroups(client, tournamentId, players, groups);
      for (let g = 1; g <= groupCount; g += 1) {
        const own = players.filter((p) => groups.get(p.id) === g).map((p) => p.id);
        await insertDoubleElimRows(client, tournamentId, groupBracketRows(t.format, own, t.advance_per_group, g));
      }
    });
    return getByTournament(tournamentId);
  }

  // Deletes the playoff matches (group-stage matches stay).
  async function deletePlayoff(client, tournamentId) {
    await client.query(`
      UPDATE axsuck.tournaments SET active_match_id = NULL
      WHERE id = $1 AND active_match_id IN (
        SELECT id FROM axsuck.matches WHERE tournament_id = $1 AND bracket <> ALL($2::text[]))
    `, [tournamentId, GROUP_STAGE_BRACKETS]);
    await client.query(
      'DELETE FROM axsuck.matches WHERE tournament_id = $1 AND bracket <> ALL($2::text[])',
      [tournamentId, GROUP_STAGE_BRACKETS],
    );
  }

  /**
   * Builds the playoff of a two-stage event from qualifier ids in seed order.
   * Group-stage matches are kept; any previous playoff is replaced.
   */
  async function generatePlayoffs(tournamentId, seededIds, format) {
    await inTransaction(db, async (client) => {
      await deletePlayoff(client, tournamentId);
      if (format === 'double_elim') {
        await insertDoubleElimRows(client, tournamentId, resolveDoubleElimRows(seededIds));
      } else {
        const bracket = describeBracket(seededIds.length);
        const slots = seedingOrder(bracket.size).map((seed) => seededIds[seed - 1] ?? null);
        await buildRounds(tournamentId, slots, bracket.totalRounds, client);
      }
      await client.query(`UPDATE axsuck.tournaments SET current_stage = 'playoff' WHERE id = $1`, [tournamentId]);
    });
    return getByTournament(tournamentId);
  }

  /** Removes the playoff and returns a two-stage event to its group stage. */
  async function clearPlayoffs(tournamentId) {
    await inTransaction(db, async (client) => {
      await deletePlayoff(client, tournamentId);
      await client.query(`UPDATE axsuck.tournaments SET current_stage = 'group' WHERE id = $1`, [tournamentId]);
    });
  }

  return { generateBracket, advanceSwiss, generatePlayoffs, clearPlayoffs };
}
