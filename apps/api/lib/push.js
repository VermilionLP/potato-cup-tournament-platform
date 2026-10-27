import { parseScheduledDateTime } from './calendar.js';

export const REMINDER_KIND = "1h";
export const REMINDER_LEAD_MS = 60 * 60 * 1000;

export function reminderWindow(scheduledTime, now = Date.now()) {
  const parsed = parseScheduledDateTime(scheduledTime);
  if (!parsed) return null;
  const start = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour - 8,
    parsed.minute,
    0,
  );
  const remindAt = start - REMINDER_LEAD_MS;
  return {
    start,
    remindAt,
    due: now >= remindAt && now < start,
  };
}

export function reminderPayload(tournament) {
  const parsed = parseScheduledDateTime(tournament.scheduled_time);
  const time = parsed
    ? `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`
    : "比赛时间";
  return {
    title: "Potato Cup 比赛提醒",
    body: `${tournament.name} 将在 ${time} 开始`,
    url: `/tournament/${encodeURIComponent(tournament.id)}`,
    tag: `suck-${tournament.id}-${REMINDER_KIND}`,
  };
}
