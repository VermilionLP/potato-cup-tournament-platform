// Device keys by player ID (see apps/api/lib/player-key.js), stored in
// localStorage. Kept per ID so switching IDs on one device keeps each key.
export const PLAYER_KEYS = 'suck_player_keys';

export function readPlayerKeys() {
  try {
    const keys = JSON.parse(localStorage.getItem(PLAYER_KEYS) || '{}');
    return keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
  } catch (_) {
    return {};
  }
}
