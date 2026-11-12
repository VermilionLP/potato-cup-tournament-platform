// Live channels of an event (axsuck.live_channels, migration 029).

import { emptyChannel, gameView } from '../lib/live-channels.js';

const COLUMNS = `channel, active_match_id, overlay_scene, overlay_round, overlay_stage, countdown_end, overlay_set_at,
  game_state, game_match_id, game_changed_at, game_seen_at, autoscene_paused`;
const withGame = (r) => ({ ...r, game: gameView(r) });

export function LiveChannelRepo(db) {
  async function list(tournamentId) {
    const res = await db.query(`
      SELECT ${COLUMNS}
      FROM axsuck.live_channels
      WHERE tournament_id = $1
      ORDER BY channel
    `, [tournamentId]);
    return res.rows.map(withGame);
  }

  async function get(tournamentId, channel) {
    const res = await db.query(`
      SELECT ${COLUMNS}
      FROM axsuck.live_channels
      WHERE tournament_id = $1 AND channel = $2
    `, [tournamentId, channel]);
    return res.rows[0] ? withGame(res.rows[0]) : emptyChannel(channel);
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
      INSERT INTO axsuck.live_channels (tournament_id, channel, overlay_scene, overlay_round, overlay_stage, overlay_set_at)
      VALUES ($1, $2, $3, $4, $6, NOW())
      ON CONFLICT (tournament_id, channel) DO UPDATE SET
        overlay_scene = EXCLUDED.overlay_scene,
        -- Picking a scene takes over from the game state reported before it.
        overlay_set_at = CASE WHEN $5 AND axsuck.live_channels.overlay_scene = EXCLUDED.overlay_scene
          THEN axsuck.live_channels.overlay_set_at ELSE NOW() END,
        overlay_round = EXCLUDED.overlay_round,
        overlay_stage = CASE WHEN $5 THEN EXCLUDED.overlay_stage ELSE axsuck.live_channels.overlay_stage END,
        -- A countdown that has run out has switched the overlay to the HUD;
        -- picking a scene afterwards takes over again.
        countdown_end = CASE WHEN axsuck.live_channels.countdown_end <= NOW() THEN NULL ELSE axsuck.live_channels.countdown_end END,
        updated_at = NOW()
    `, [tournamentId, channel, scene || 'auto', round || null, stage !== undefined, stage || null]);
    return get(tournamentId, channel);
  }

  /** Starts (a Date) or clears (null) the channel's match start countdown. */
  async function setCountdown(tournamentId, channel, end) {
    await db.query(`
      INSERT INTO axsuck.live_channels (tournament_id, channel, countdown_end)
      VALUES ($1, $2, $3)
      ON CONFLICT (tournament_id, channel)
      DO UPDATE SET countdown_end = EXCLUDED.countdown_end, updated_at = NOW()
    `, [tournamentId, channel, end]);
    return get(tournamentId, channel);
  }

  /**
   * The auto-scene script checking in with the game state. A change also
   * stores the live match it is about (kept when a battle ends) and when.
   * Returns { channel, changed }.
   */
  async function reportGame(tournamentId, channel, state) {
    const before = await get(tournamentId, channel);
    const changed = before.game?.state !== state;
    await db.query(`
      INSERT INTO axsuck.live_channels (tournament_id, channel, game_state, game_match_id, game_changed_at, game_seen_at)
      VALUES ($1, $2, $3, NULL, NOW(), NOW())
      ON CONFLICT (tournament_id, channel) DO UPDATE SET
        game_state = EXCLUDED.game_state,
        game_match_id = CASE
          WHEN NOT $4 THEN axsuck.live_channels.game_match_id
          WHEN EXCLUDED.game_state = 'ended' THEN COALESCE(axsuck.live_channels.game_match_id, axsuck.live_channels.active_match_id)
          ELSE axsuck.live_channels.active_match_id END,
        game_changed_at = CASE WHEN $4 THEN NOW() ELSE axsuck.live_channels.game_changed_at END,
        game_seen_at = NOW()
    `, [tournamentId, channel, state, changed]);
    return { channel: await get(tournamentId, channel), changed };
  }

  /** Pauses or resumes the overlay following the game state. */
  async function setPaused(tournamentId, channel, paused) {
    await db.query(`
      INSERT INTO axsuck.live_channels (tournament_id, channel, autoscene_paused)
      VALUES ($1, $2, $3)
      ON CONFLICT (tournament_id, channel)
      DO UPDATE SET autoscene_paused = EXCLUDED.autoscene_paused, updated_at = NOW()
    `, [tournamentId, channel, Boolean(paused)]);
    return get(tournamentId, channel);
  }

  return { list, get, setActiveMatch, setOverlay, setCountdown, reportGame, setPaused };
}
