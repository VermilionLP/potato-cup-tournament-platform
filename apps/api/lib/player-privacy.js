// What the public player endpoints may show. The last-seen IP address
// (players.last_ip) is for admins only (spotting duplicate accounts); the
// self-service routes that return a player's own row (touch, profile save)
// check identity first and may keep it.

const ADMIN_ONLY = ['last_ip'];

/** The player row without admin-only fields unless `admin`. */
export function publicPlayer(player, admin = false) {
  if (!player || admin) return player;
  const out = { ...player };
  for (const key of ADMIN_ONLY) delete out[key];
  return out;
}
