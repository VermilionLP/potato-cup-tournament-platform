export const PLAYER_ACTIVE_DAYS = 365;

export function isRecentlySeen(player, now = Date.now()) {
  const value = typeof player === "string" ? player : player?.last_seen_at;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return now - time <= PLAYER_ACTIVE_DAYS * 24 * 60 * 60 * 1000;
}
