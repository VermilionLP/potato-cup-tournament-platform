// Live channels of an event (axsuck.live_channels, migration 029).

import { emptyChannel } from '../lib/live-channels.js';

export function LiveChannelRepo(db) {
  async function list(tournamentId) {
    const res = await db.query(`
      SELECT channel, active_match_id, overlay_scene, overlay_round, overlay_stage
      FROM axsuck.live_channels
      WHERE tournament_id = $1
      ORDER BY channel
    `, [tournamentId]);
    return res.rows;
  }

  async function get(tournamentId, channel) {
    const res = await db.query(`
      SELECT channel, active_match_id, overlay_scene, overlay_round, overlay_stage
      FROM axsuck.live_channels
      WHERE tournament_id = $1 AND channel = $2
    `, [tournamentId, channel]);
    return res.rows[0] || emptyChannel(channel);
  }

  /**
   * Makes `matchId` (or nothing, with null) the channel's live match.
   * Returns { conflict: <channel> } when the match is live on another
   * channel of the event, { notFound: true } when it isn't the event's.
   */
  async function setActiveMatch(tournamentId, channel, matchId) {
    if (matchId !== null) {
      const match = await db.query('SELECT 1 FROM axsuck.matches WHERE id = $1 AND tournament_id = $2', [matchId, tournamentId]);
      if (match.rowCount === 0) return { notFound: true };
      const other = await db.query(`
        SELECT channel FROM axsuck.live_channels
        WHERE active_match_id = $1 AND NOT (tournament_id = $2 AND channel = $3)
      `, [matchId, tournamentId, channel]);
      if (other.rowCount > 0) return { conflict: Number(other.rows[0].channel) };
    }
    try {
      await db.query(`
        INSERT INTO axsuck.live_channels (tournament_id, channel, active_match_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (tournament_id, channel)
        DO UPDATE SET active_match_id = EXCLUDED.active_match_id, updated_at = NOW()
      `, [tournamentId, channel, matchId]);
    } catch (e) {
      // Two consoles put the same match live at once: the unique index wins.
      if (e.code === '23505') {
        const other = await db.query('SELECT channel FROM axsuck.live_channels WHERE active_match_id = $1', [matchId]);
        return { conflict: Number(other.rows[0]?.channel) || null };
      }
      throw e;
    }
    return { channel: await get(tournamentId, channel) };
  }

  // overlay_stage undefined = keep the current one.
  async function setOverlay(tournamentId, channel, scene, round, stage) {
    await db.query(`
      INSERT INTO axsuck.live_channels (tournament_id, channel, overlay_scene, overlay_round, overlay_stage)
      VALUES ($1, $2, $3, $4, $6)
      ON CONFLICT (tournament_id, channel) DO UPDATE SET
        overlay_scene = EXCLUDED.overlay_scene,
        overlay_round = EXCLUDED.overlay_round,
        overlay_stage = CASE WHEN $5 THEN EXCLUDED.overlay_stage ELSE axsuck.live_channels.overlay_stage END,
        updated_at = NOW()
    `, [tournamentId, channel, scene || 'auto', round || null, stage !== undefined, stage || null]);
    return get(tournamentId, channel);
  }

  return { list, get, setActiveMatch, setOverlay };
}
