// Personal web push: notices for given players (migration 034 ties a
// subscription to the player who subscribed). The transport is set by
// lib/push-keys.js once there are VAPID keys (it imports web-push), so
// routes can use this without the package; without a transport nothing is
// sent.

let transport = null;

export function setPushTransport(fn) {
  transport = fn;
}

export function pushEnabled() {
  return Boolean(transport);
}

/** Sends one notification (throws like web-push: statusCode 404 / 410 for a dead subscription). */
export function sendRaw(subscription, payload) {
  if (!transport) throw new Error('Push notifications are not configured');
  return transport(subscription, payload);
}

/** Sends `payload` to every subscription of these players; drops dead ones. */
export async function sendToPlayers(db, playerIds, payload, log = console) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!transport || !ids.length) return 0;
  const subs = (await db.query(
    'SELECT endpoint, p256dh, auth FROM axsuck.push_subscriptions WHERE player_id = ANY($1::text[])',
    [ids],
  )).rows;
  let sent = 0;
  for (const s of subs) {
    try {
      await transport({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await db.query('DELETE FROM axsuck.push_subscriptions WHERE endpoint = $1', [s.endpoint]);
      } else {
        log.error?.({ err: error, endpoint: s.endpoint }, 'personal push failed');
      }
    }
  }
  return sent;
}

/** Claims a notice (match, kind) once; false when it was sent before. */
export async function claimNotice(db, matchId, kind) {
  const res = await db.query(
    'INSERT INTO axsuck.push_match_notices (match_id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING match_id',
    [matchId, kind],
  );
  return res.rowCount > 0;
}
