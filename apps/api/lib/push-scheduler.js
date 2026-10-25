import webpush from 'web-push';
import { reminderPayload, reminderWindow, REMINDER_KIND } from './push.js';

export function startPushScheduler(fastify) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:REMOVED_EMAIL';
  if (!publicKey || !privateKey) {
    fastify.log.warn('VAPID keys are not configured; web push is disabled.');
    return;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const tournaments = (await fastify.db.query(`
        SELECT id, name, scheduled_time
        FROM axsuck.tournaments
        WHERE status <> 'completed' AND scheduled_time <> ''
      `)).rows;
      const due = tournaments.filter((tournament) => {
        const window = reminderWindow(tournament.scheduled_time);
        return window?.due;
      });
      if (due.length === 0) return;

      const subscriptions = (await fastify.db.query(
        'SELECT endpoint, p256dh, auth FROM axsuck.push_subscriptions',
      )).rows;
      if (subscriptions.length === 0) return;

      for (const tournament of due) {
        const claimed = await fastify.db.query(`
          INSERT INTO axsuck.push_reminders (tournament_id, kind)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
          RETURNING tournament_id
        `, [tournament.id, REMINDER_KIND]);
        if (claimed.rowCount === 0) continue;

        const payload = JSON.stringify(reminderPayload(tournament));
        for (const subscription of subscriptions) {
          try {
            await webpush.sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            }, payload);
          } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
              await fastify.db.query(
                'DELETE FROM axsuck.push_subscriptions WHERE endpoint = $1',
                [subscription.endpoint],
              );
            } else {
              fastify.log.error({ err: error, endpoint: subscription.endpoint }, 'push send failed');
            }
          }
        }
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'push scheduler tick failed');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  tick();
  fastify.addHook('onClose', async () => clearInterval(timer));
}
