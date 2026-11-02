// Check-in before an event (migration 034). When an event asks for it,
// registered players check in during the CHECKIN_LEAD_MS before the
// scheduled time (Beijing time, as everywhere); it stays open until an admin
// starts the event. Events without a time can be checked in to any time
// during registration. Pure.

import { parseScheduledDateTime } from './calendar.js';

export const CHECKIN_LEAD_MS = 30 * 60 * 1000;

/** Start of the event in ms (scheduled_time is Beijing time), or null. */
export function scheduledStart(scheduledTime) {
  const p = parseScheduledDateTime(scheduledTime);
  if (!p) return null;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour - 8, p.minute, 0);
}

/** { enabled, open, opens_at } of an event at `now`. */
export function checkinState(t, now = Date.now()) {
  const enabled = Boolean(t?.checkin_enabled);
  const start = scheduledStart(t?.scheduled_time);
  const opensAt = start == null ? null : start - CHECKIN_LEAD_MS;
  const open = enabled && t?.status === 'registration' && (opensAt == null || now >= opensAt);
  return { enabled, open, opens_at: opensAt == null ? null : new Date(opensAt).toISOString() };
}
