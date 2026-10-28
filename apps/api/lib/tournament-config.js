import { swissStartBlockedReason } from './swiss.js';
import { eliminationGroupsBlockedReason, twoStageStartBlockedReason } from './group-stage.js';

// Shared rules for creating a tournament. Kept free of database access so the
// behaviour can be unit tested without PostgreSQL.

export const GAME_MODES = ['ab', 'rb', 'sb'];
export const DEFAULT_GAME_MODE = 'rb';

// Formats the bracket engine can run.
export const SUPPORTED_FORMATS = ['single_elim', 'double_elim', 'swiss'];

export const DEFAULT_VEHICLE_POOL = 'proleague';
// Event types (vehicle pools) events are grouped by in the ladder and the
// statistics: 螺旋桨 / 顶级喷气 / 早期喷气 / Pro League BVR.
export const VEHICLE_POOLS = ['prop', 'top-jet', 'legacy-jet', 'proleague'];

// Jet events before Potato Cup Weekly #23 (2026-05-30, Beijing time) are
// Top Jet; from #23 on, Legacy Jet (migration 030, the Liquipedia import).
export const TOP_JET_UNTIL = '2026-05-30';

// Points leaderboards follow the published ones (Potato_Cup/Leaderboard/2026),
// where Top Jet weeklies count towards the Legacy Jet board.
const POINTS_BOARD = { 'top-jet': 'legacy-jet' };

/** The points board an event type counts towards. */
export function pointsBoardOf(pool) {
  return POINTS_BOARD[pool] || pool;
}

/**
 * A tournament created with a match time skips the time-vote phase and opens
 * registration straight away; otherwise players vote on the time first.
 */
export function resolveInitialStatus(scheduledTime) {
  return String(scheduledTime ?? '').trim() ? 'registration' : 'voting';
}

export function normalizeGameMode(value) {
  const mode = String(value ?? '').trim().toLowerCase();
  return GAME_MODES.includes(mode) ? mode : DEFAULT_GAME_MODE;
}

export function isValidVehiclePool(value) {
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(value ?? '').trim().toLowerCase());
}

/** The event's type: one of VEHICLE_POOLS, else the default. */
export function normalizeEventPool(value) {
  const pool = String(value ?? '').trim().toLowerCase();
  return VEHICLE_POOLS.includes(pool) ? pool : DEFAULT_VEHICLE_POOL;
}

export function normalizeVehiclePool(value) {
  return isValidVehiclePool(value)
    ? String(value).trim().toLowerCase()
    : DEFAULT_VEHICLE_POOL;
}

// Fewest registered players each format needs before a bracket can start.
// Double elimination needs a losers' bracket, which takes at least four.
export const MIN_PLAYERS_BY_FORMAT = { single_elim: 2, double_elim: 4, swiss: 2 };

export function minPlayersForFormat(format) {
  return MIN_PLAYERS_BY_FORMAT[format] ?? MIN_PLAYERS_BY_FORMAT.single_elim;
}

/**
 * Returns the reason a tournament cannot start yet, or null when it can.
 * Used to refuse the switch to `in_progress` with too few players.
 */
export function startBlockedReason(format, playerCount, swissRounds = null, twoStage = null) {
  const min = minPlayersForFormat(format);
  const count = Number(playerCount) || 0;
  if (count < min) return `至少需要 ${min} 名选手才能开赛（当前 ${count} 人）`;
  if (twoStage?.playoffFormat) {
    if (format === 'swiss') return twoStageStartBlockedReason(count, { rounds: swissRounds, ...twoStage });
    return eliminationGroupsBlockedReason(count, { format, ...twoStage });
  }
  if (format === 'swiss') return swissStartBlockedReason(count, swissRounds);
  return null;
}
