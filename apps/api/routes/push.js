import { getRequesterId } from '../lib/admin.js';
import { playerKeyMatches, requestPlayerKey, storedKeyHash } from '../lib/player-key.js';
import { pushKeys } from '../lib/push-keys.js';
import { sendRaw } from '../lib/push-sender.js';

// One test notification per subscription a minute.
const TEST_INTERVAL_MS = 60 * 1000;

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
  // The key browsers subscribe with; made (and kept) on first use when
  // .env has none (lib/push-keys.js).
  fastify.get('/push/public-key', async (req) => {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '').split(',')[0].trim();
    const keys = await pushKeys(fastify.db, { create: true, origin: req.headers.host ? `${proto}://${req.headers.host}` : '' });
    if (!keys) throw fastify.httpErrors.serviceUnavailable('Push notifications are not configured');
    return { publicKey: keys.publicKey };
  });

  // A test notification to one subscription of this site, so a player sees
  // at once whether notifications reach this device.
  const lastTest = new Map();
  fastify.post('/push/test', async (req) => {
    const { endpoint } = req.body || {};
    if (!endpoint) throw fastify.httpErrors.badRequest('endpoint is required');
    const sub = (await fastify.db.query(
      'SELECT endpoint, p256dh, auth FROM axsuck.push_subscriptions WHERE endpoint = $1', [endpoint],
    )).rows[0];
    if (!sub) throw fastify.httpErrors.notFound('This browser is not subscribed');
    const now = Date.now();
    if (now - (lastTest.get(endpoint) || 0) < TEST_INTERVAL_MS) {
      throw fastify.httpErrors.tooManyRequests('Please wait a minute before sending another test');
    }
    lastTest.set(endpoint, now);
    if (lastTest.size > 1000) lastTest.delete(lastTest.keys().next().value);
    if (!(await pushKeys(fastify.db))) throw fastify.httpErrors.serviceUnavailable('Push notifications are not configured');
    try {
      await sendRaw({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({
        title: '测试通知',
        body: '收到这条就说明比赛提醒能送达这台设备。',
        url: '/',
        tag: 'potato-cup-test',
      }));
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await fastify.db.query('DELETE FROM axsuck.push_subscriptions WHERE endpoint = $1', [endpoint]);
        throw fastify.httpErrors.gone('This browser subscription has expired; turn notifications off and on again');
      }
      req.log.warn({ err: error, endpoint }, 'test push failed');
      throw fastify.httpErrors.badGateway('The browser push service did not accept the notification');
    }
    return { success: true };
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
