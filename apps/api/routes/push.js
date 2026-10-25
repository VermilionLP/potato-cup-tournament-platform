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
    await fastify.db.query(`
      INSERT INTO axsuck.push_subscriptions (endpoint, p256dh, auth)
      VALUES ($1, $2, $3)
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth
    `, [endpoint, keys.p256dh, keys.auth]);
    return { success: true };
  });

  fastify.delete('/push/unsubscribe', async (req) => {
    const { endpoint } = req.body || {};
    if (!endpoint) throw fastify.httpErrors.badRequest('endpoint is required');
    await fastify.db.query('DELETE FROM axsuck.push_subscriptions WHERE endpoint = $1', [endpoint]);
    return { success: true };
  });
}
