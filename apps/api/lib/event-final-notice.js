// The QQ group's "event finished" post: when an admin marks an event
// completed, the community bot posts the final placings (text naming the
// podium, @-ing them, plus a results picture the bot draws from `data`:
// apps/bot/src/cards-more.js finalCard). Once per event and champion (a
// reopened event that ends the same way is not announced again).

import { botNoticesEnabled, noticeText, queueBotNotice } from './bot-notices.js';
import { eventPlacements } from './placements.js';
import { pointsFor } from './points.js';

export const FINAL_ROWS = 8;

/**
 * The first `n` placings, best first: [{ id, name, flag, from, to, place:
 * "1" | "3-4", points, prize }]. Empty when the event has no champion. Pure.
 */
export function finalRows(event, players = [], matches = [], n = FINAL_ROWS) {
  const places = eventPlacements(event, matches, players.map((p) => ({ id: p.id, seed: p.seed, swiss_group: p.swiss_group })));
  if (!places.size) return [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const table = event.points_table || [];
  return [...places]
    .sort(([a, pa], [b, pb]) => pa.from - pb.from || String(a).localeCompare(String(b)))
    .slice(0, n)
    .map(([id, place]) => {
      const p = byId.get(id) || {};
      const row = table.find((r) => place.from >= r.from && place.from <= r.to);
      return {
        id,
        name: p.display_name || id,
        flag: p.flag || '',
        from: place.from,
        to: place.to,
        place: place.to > place.from ? `${place.from}-${place.to}` : String(place.from),
        points: pointsFor(table, place),
        prize: Number(row?.prize) || 0,
      };
    });
}

/** Queues the post for a just-finished event; returns the notice id or null. */
export async function notifyEventFinished(db, { event, players = [], matches = [] }, log = console) {
  if (!botNoticesEnabled() || !event) return null;
  const rows = finalRows(event, players, matches);
  if (!rows.length) return null;
  const claimed = await db.query(`
    INSERT INTO axsuck.push_reminders (tournament_id, kind) VALUES ($1, $2)
    ON CONFLICT DO NOTHING RETURNING tournament_id
  `, [event.id, `qq-final:${rows[0].id}`]);
  if (claimed.rowCount === 0) return null;
  const podium = rows.filter((r) => r.from <= 3);
  return queueBotNotice(db, {
    kind: 'final',
    tournamentId: event.id,
    text: noticeText.final(event.name, podium),
    mention: podium.map((r) => r.id),
    data: {
      event: event.name,
      day: String(event.played_at || event.scheduled_time || '').slice(0, 10),
      players: players.length,
      rows,
    },
  }, log);
}
