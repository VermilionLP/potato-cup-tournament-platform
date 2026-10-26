// Shared rules for creating a tournament. Kept free of database access so the
// behaviour can be unit tested without PostgreSQL.

export const GAME_MODES = ['ab', 'rb', 'sb'];
export const DEFAULT_GAME_MODE = 'rb';

// Formats the current bracket engine can actually run. Swiss is added later.
export const SUPPORTED_FORMATS = ['single_elim', 'double_elim'];

export const DEFAULT_VEHICLE_POOL = 'proleague';

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

export function normalizeVehiclePool(value) {
  return isValidVehiclePool(value)
    ? String(value).trim().toLowerCase()
    : DEFAULT_VEHICLE_POOL;
}
