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

// Contacts (QQ / Discord in players.battle_tags) are for signed-in players
// and admins; guests get the rest of battle_tags (e.g. the display name).
const CONTACT_KEYS = ['qq', 'discord'];

/** battle_tags (string or object) without the contact keys, in the same form. */
export function withoutContact(raw) {
  let tags = raw;
  const asString = typeof raw === 'string';
  if (asString) {
    try {
      tags = JSON.parse(raw || '{}');
    } catch {
      return raw;
    }
  }
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return raw;
  const out = { ...tags };
  for (const key of CONTACT_KEYS) delete out[key];
  return asString ? JSON.stringify(out) : out;
}

/** The row with its battle_tags' contacts removed unless `show`. */
export function contactFor(row, show) {
  if (show || !row || row.battle_tags === undefined) return row;
  return { ...row, battle_tags: withoutContact(row.battle_tags) };
}

/**
 * Whether the caller may see players' contacts: an admin, or a player of
 * the site (an x-player-id that exists, with its device key once bound).
 */
export async function canSeeContacts(db, req, { isAdmin, requesterId, keyOk }) {
  if (isAdmin(req)) return true;
  const id = requesterId(req);
  if (!id) return false;
  const { rows } = await db.query('SELECT 1 FROM axsuck.players WHERE id = $1', [id]);
  if (!rows.length) return false;
  return keyOk(req, id);
}
