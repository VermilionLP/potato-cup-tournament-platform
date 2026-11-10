// Every minute, while the QQ bots are on: an event that starts within the
// hour gets one notice in the QQ group, with an @ for each registered
// player who has a QQ number in their contact. Same window as the web push
// reminder (lib/push.js), claimed once per event in push_reminders.

import { reminderWindow } from './push.js';
import { parseScheduledDateTime } from './calendar.js';
import { botNoticesEnabled, clockOf, noticeText, queueBotNotice } from './bot-notices.js';

export const QQ_REMINDER_KIND = 'qq-1h';

/** Queues the reminder for every event that is due and not reminded yet. */
export async function queueEventReminders(db, now = Date.now(), log = console) {
  if (!botNoticesEnabled()) return 0;
  const events = (await db.query(`
    SELECT id, name, scheduled_time, checkin_enabled FROM axsuck.tournaments
    WHERE status = 'registration' AND scheduled_time <> ''
  `)).rows;
  let queued = 0;
  for (const e of events) {
    if (!reminderWindow(e.scheduled_time, now)?.due) continue;
    const claimed = await db.query(`
      INSERT INTO axsuck.push_reminders (tournament_id, kind) VALUES ($1, $2)
      ON CONFLICT DO NOTHING RETURNING tournament_id
    `, [e.id, QQ_REMINDER_KIND]);
    if (claimed.rowCount === 0) continue;
    const players = (await db.query(
      'SELECT player_id FROM axsuck.tournament_players WHERE tournament_id = $1 ORDER BY player_id', [e.id],
    )).rows.map((r) => r.player_id);
    const time = clockOf(parseScheduledDateTime(e.scheduled_time));
    if (await queueBotNotice(db, {
      kind: 'soon',
      tournamentId: e.id,
      text: noticeText.soon(e.name, time, e.checkin_enabled),
      mention: players,
    }, log)) queued += 1;
  }
  return queued;
}

export function startBotScheduler(fastify) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await queueEventReminders(fastify.db, Date.now(), fastify.log);
    } catch (err) {
      fastify.log.error({ err }, 'bot reminder tick failed');
    } finally {
      running = false;
    }
  };
  setInterval(tick, 60_000).unref?.();
  setTimeout(tick, 5_000).unref?.();
}
