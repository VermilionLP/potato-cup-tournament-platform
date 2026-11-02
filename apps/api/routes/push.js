import { getRequesterId } from '../lib/admin.js';
import { playerKeyMatches, requestPlayerKey, storedKeyHash } from '../lib/player-key.js';

// The player a subscription belongs to: the caller's player ID, when it is
// not bound to another device. Personal notices go only to that player.
async function subscriberOf(db, req) {
  const id = getRequesterId(req);
  if (!id) return null;
  const hash = await storedKeyHash(db, id);
  if (hash && !playerKeyMatches(requestPlayerKey(req), hash)) return null;
  return id;
}

export default async function pushRoutes(fastify) {
  fastify.get('/push/public-key', async () => {
    const publicKey = process.env.VAPID_PUBLIC_KEY || '';
    if (!publicKey) {
      throw fastify.httpErrors.serviceUnavailable('Push notifications are not configured');
    }
    return { publicKey };
  });

  fastify.post('/push/subscribe', async (req) => {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw fastify.httpErrors.badRequest('endpoint and keys are required');
    }
    if (!/^https?:\/\//i.test(endpoint)) {
      throw fastify.httpErrors.badRequest('Invalid endpoint');
    }
    const playerId = await subscriberOf(fastify.db, req);
    await fastify.db.query(`
      INSERT INTO axsuck.push_subscriptions (endpoint, p256dh, auth, player_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        player_id = EXCLUDED.player_id
    `, [endpoint, keys.p256dh, keys.auth, playerId]);
    return { success: true };
  });

  fastify.delete('/push/unsubscribe', async (req) => {
    const { endpoint } = req.body || {};
    if (!endpoint) throw fastify.httpErrors.badRequest('endpoint is required');
    await fastify.db.query('DELETE FROM axsuck.push_subscriptions WHERE endpoint = $1', [endpoint]);
    return { success: true };
  });
}
