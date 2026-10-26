import { getPlayerDisplayName } from './player-repo.js';
import { isSameVoteTime, normalizeVoteTime } from '../lib/vote-time.js';
import {
  normalizeGameMode,
  normalizeVehiclePool,
  resolveInitialStatus,
  SUPPORTED_FORMATS,
} from '../lib/tournament-config.js';
import { parseSwissRounds } from '../lib/swiss.js';

export function TournamentRepo(db) {
  async function list() {
    const res = await db.query(`
      SELECT
        t.*,
        COUNT(tp.player_id)::int AS player_count,
        (SELECT COUNT(DISTINCT tv.player_id)::int
         FROM axsuck.time_votes tv
         WHERE tv.tournament_id = t.id) AS voter_count
      FROM axsuck.tournaments t
      LEFT JOIN axsuck.tournament_players tp ON tp.tournament_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    return res.rows;
  }

  async function getById(id) {
    const res = await db.query(`
      SELECT
        t.*,
        COUNT(tp.player_id)::int AS player_count,
        (SELECT COUNT(DISTINCT tv.player_id)::int
         FROM axsuck.time_votes tv
         WHERE tv.tournament_id = t.id) AS voter_count
      FROM axsuck.tournaments t
      LEFT JOIN axsuck.tournament_players tp ON tp.tournament_id = t.id
      WHERE t.id = $1
      GROUP BY t.id
    `, [id]);
    return res.rows[0] || null;
  }

  async function create({ id, name, description, player_capacity, hold_third_place, loser_advances, scheduled_time, game_mode, vehicle_pool, format, grand_final_reset, swiss_rounds, banpick_enabled }) {
    const scheduledTime = String(scheduled_time || '').trim();
    const bracketFormat = SUPPORTED_FORMATS.includes(format) ? format : SUPPORTED_FORMATS[0];
    await db.query(`
      INSERT INTO axsuck.tournaments
        (id, name, description, status, player_capacity, hold_third_place, loser_advances, scheduled_time, game_mode, vehicle_pool, format, grand_final_reset, swiss_rounds, banpick_enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      id,
      name,
      description || '',
      resolveInitialStatus(scheduledTime),
      player_capacity || 128,
      hold_third_place ? 1 : 0,
      loser_advances ? 1 : 0,
      scheduledTime,
      normalizeGameMode(game_mode),
      normalizeVehiclePool(vehicle_pool),
      bracketFormat,
      bracketFormat === 'double_elim' && grand_final_reset !== false,
      bracketFormat === 'swiss' ? parseSwissRounds(swiss_rounds) : null,
      banpick_enabled !== false,
    ]);
    return getById(id);
  }

  async function rename(id, name) {
    const res = await db.query(`
      UPDATE axsuck.tournaments
      SET name = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id
    `, [name, id]);
    if (!res.rowCount) return null;
    return getById(id);
  }

  async function setSwissRounds(id, rounds) {
    const res = await db.query(`
      UPDATE axsuck.tournaments SET swiss_rounds = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id
    `, [rounds, id]);
    return res.rowCount > 0 ? getById(id) : null;
  }

  async function updateStatus(id, status, scheduledTime = null, createdAt = null, updatedAt = null) {
    if (createdAt && updatedAt) {
      await db.query(`
        UPDATE axsuck.tournaments SET status = $1, scheduled_time = $2, created_at = $3, updated_at = $4 WHERE id = $5
      `, [status, scheduledTime || '', createdAt, updatedAt, id]);
    } else if (scheduledTime !== null) {
      await db.query(`
        UPDATE axsuck.tournaments SET status = $1, scheduled_time = $2, updated_at = NOW() WHERE id = $3
      `, [status, scheduledTime, id]);
    } else {
      await db.query(`
        UPDATE axsuck.tournaments SET status = $1, updated_at = NOW() WHERE id = $2
      `, [status, id]);
    }
    return getById(id);
  }

  async function getPlayers(tournamentId) {
    const res = await db.query(`
      SELECT 
        p.id, 
        p.battle_tags,
        COALESCE(NULLIF(p.flag, ''), NULLIF(tp.flag, ''), 'cn') AS flag, 
        COALESCE(NULLIF(tp.team, ''), p.team, '') AS team, 
        COALESCE(NULLIF(tp.link, ''), p.link, '') AS link, 
        p.bnet_ids,
        tp.seed, 
        tp.registered_at
      FROM axsuck.tournament_players tp
      JOIN axsuck.players p ON p.id = tp.player_id
      WHERE tp.tournament_id = $1
      ORDER BY tp.seed IS NULL, tp.seed ASC, tp.registered_at ASC
    `, [tournamentId]);

    return res.rows.map(r => ({
      ...r,
      display_name: getPlayerDisplayName(r)
    }));
  }

  async function addPlayer(tournamentId, playerId) {
    const existing = await db.query(`
      SELECT 1 FROM axsuck.tournament_players WHERE tournament_id = $1 AND player_id = $2
    `, [tournamentId, playerId]);
    if (existing.rows.length > 0) return false;

    const tourney = await getById(tournamentId);
    if (!tourney) throw new Error('Tournament not found');

    const countRes = await db.query(`
      SELECT COUNT(*)::int as cnt FROM axsuck.tournament_players WHERE tournament_id = $1
    `, [tournamentId]);
    const count = countRes.rows[0]?.cnt || 0;

    if (count >= tourney.player_capacity) {
      throw new Error('Tournament is full');
    }

    await db.query(`
      INSERT INTO axsuck.players (id) VALUES ($1)
      ON CONFLICT (id) DO NOTHING
    `, [playerId]);

    const pRes = await db.query('SELECT team FROM axsuck.players WHERE id = $1', [playerId]);
    const p = pRes.rows[0];

    await db.query(`
      INSERT INTO axsuck.tournament_players (tournament_id, player_id, seed, team) 
      VALUES ($1, $2, $3, $4)
    `, [tournamentId, playerId, count + 1, p?.team || '']);

    return true;
  }

  async function autoRegisterVoters(tournamentId, scheduledTime) {
    if (!normalizeVoteTime(scheduledTime)) return [];
    const tourney = await getById(tournamentId);
    if (!tourney) return [];

    const votes = await db.query(`
      SELECT player_id, proposed_time
      FROM axsuck.time_votes
      WHERE tournament_id = $1
      ORDER BY created_at ASC
    `, [tournamentId]);
    const voters = [];
    const seen = new Set();
    for (const vote of votes.rows) {
      if (!isSameVoteTime(vote.proposed_time, scheduledTime)) continue;
      if (seen.has(vote.player_id)) continue;
      seen.add(vote.player_id);
      voters.push(vote.player_id);
    }
    if (voters.length === 0) return [];

    const existingRes = await db.query(
      'SELECT player_id FROM axsuck.tournament_players WHERE tournament_id = $1',
      [tournamentId],
    );
    const existing = new Set(existingRes.rows.map((row) => row.player_id));
    const countRes = await db.query(
      'SELECT COUNT(*)::int AS cnt FROM axsuck.tournament_players WHERE tournament_id = $1',
      [tournamentId],
    );
    let seed = (countRes.rows[0]?.cnt || 0) + 1;
    const added = [];

    for (const playerId of voters) {
      if (existing.has(playerId)) continue;
      if (seed > tourney.player_capacity) break;
      const playerRes = await db.query('SELECT team FROM axsuck.players WHERE id = $1', [playerId]);
      const res = await db.query(`
        INSERT INTO axsuck.tournament_players (tournament_id, player_id, seed, team)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [tournamentId, playerId, seed, playerRes.rows[0]?.team || '']);
      if (res.rowCount > 0) {
        added.push(playerId);
        seed += 1;
      }
    }
    return added;
  }

  async function removePlayer(tournamentId, playerId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        DELETE FROM axsuck.tournament_players WHERE tournament_id = $1 AND player_id = $2
      `, [tournamentId, playerId]);

      // Re-compact remaining player seeds
      const remainingRes = await client.query(`
        SELECT player_id FROM axsuck.tournament_players
        WHERE tournament_id = $1
        ORDER BY seed ASC, registered_at ASC
      `, [tournamentId]);

      for (let idx = 0; idx < remainingRes.rows.length; idx++) {
        const p = remainingRes.rows[idx];
        await client.query(`
          UPDATE axsuck.tournament_players SET seed = $1
          WHERE tournament_id = $2 AND player_id = $3
        `, [idx + 1, tournamentId, p.player_id]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function setSeeds(tournamentId, playerIds) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE axsuck.tournament_players SET seed = NULL WHERE tournament_id = $1
      `, [tournamentId]);

      for (let idx = 0; idx < playerIds.length; idx++) {
        await client.query(`
          UPDATE axsuck.tournament_players SET seed = $1 WHERE tournament_id = $2 AND player_id = $3
        `, [idx + 1, tournamentId, playerIds[idx]]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function getMatches(tournamentId) {
    const res = await db.query(`
      SELECT * FROM axsuck.matches WHERE tournament_id = $1 ORDER BY round DESC, position ASC
    `, [tournamentId]);
    return res.rows;
  }

  async function getVotes(tournamentId) {
    const res = await db.query(`
      SELECT tv.*, p.battle_tags, p.id AS player_id
      FROM axsuck.time_votes tv
      JOIN axsuck.players p ON p.id = tv.player_id
      WHERE tv.tournament_id = $1
      ORDER BY tv.created_at ASC
    `, [tournamentId]);

    return res.rows.map(r => ({
      ...r,
      display_name: getPlayerDisplayName({ id: r.player_id, battle_tags: r.battle_tags })
    }));
  }

  async function getCustomVotes(tournamentId) {
    const res = await db.query(`
      SELECT cv.*, p.battle_tags, p.id AS player_id
      FROM axsuck.custom_votes cv
      JOIN axsuck.players p ON p.id = cv.player_id
      WHERE cv.tournament_id = $1
      ORDER BY cv.topic ASC, cv.value ASC, cv.created_at ASC
    `, [tournamentId]);

    return res.rows.map(r => ({
      ...r,
      display_name: getPlayerDisplayName({ id: r.player_id, battle_tags: r.battle_tags })
    }));
  }

  async function updateOverlayState(id, overlay_scene, overlay_round) {
    await db.query(`
      UPDATE axsuck.tournaments SET overlay_scene = $1, overlay_round = $2, updated_at = NOW() WHERE id = $3
    `, [overlay_scene, overlay_round || null, id]);
    return getById(id);
  }

  return { list, getById, create, rename, setSwissRounds, updateStatus, updateOverlayState, getPlayers, addPlayer, autoRegisterVoters, removePlayer, setSeeds, getMatches, getVotes, getCustomVotes };
}
