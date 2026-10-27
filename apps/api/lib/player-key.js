// Device keys for players. Players have no password: the site trusts the
// x-player-id header. To stop anyone from acting as someone else, the first
// device that uses an ID binds a random key to it (trust on first use); after
// that, self-service requests for that ID must carry the key in x-player-key.
// Only a SHA-256 hash is stored. An admin can reset a key so the player can
// bind again (e.g. after losing the device).

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export const PLAYER_KEY_HEADER = 'x-player-key';

export function newPlayerKey() {
  return randomBytes(24).toString('base64url');
}

export function hashPlayerKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

export function playerKeyMatches(key, hash) {
  if (!key || !hash) return false;
  const a = Buffer.from(hashPlayerKey(key), 'hex');
  const b = Buffer.from(String(hash), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requestPlayerKey(req) {
  const header = req?.headers?.[PLAYER_KEY_HEADER];
  const raw = Array.isArray(header) ? header[0] : header;
  return raw ? String(raw).trim() : '';
}

/** Stored key hash of a player, or null when the ID is not bound yet. */
export async function storedKeyHash(db, playerId) {
  if (!db) return null;
  const res = await db.query('SELECT key_hash FROM axsuck.player_keys WHERE player_id = $1', [String(playerId)]);
  return res.rows[0]?.key_hash || null;
}
