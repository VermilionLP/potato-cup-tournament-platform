export function parseScheduledDateTime(raw) {
  const match = String(raw || "").match(
    /(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[^\d]*(\d{1,2}):(\d{2}))?/,
  );
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] == null ? 20 : Number(match[4]),
    minute: match[5] == null ? 0 : Number(match[5]),
    hasTime: match[4] != null,
  };
}

function icsStamp(year, month, day, hour, minute) {
  // scheduled_time is Asia/Shanghai (UTC+8); ICS dates use UTC.
  const date = new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0));
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function eventLines({ id, name, scheduledTime, scheduled_time }, now) {
  const start = parseScheduledDateTime(scheduledTime ?? scheduled_time);
  if (!start) return [];
  const startStamp = icsStamp(start.year, start.month, start.day, start.hour, start.minute);
  const endStamp = icsStamp(start.year, start.month, start.day, start.hour + 2, start.minute);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VEVENT",
    `UID:suck-${escapeIcs(id)}@suck-tournament`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${escapeIcs(name)}`,
    `DESCRIPTION:${escapeIcs(`Potato Cup Tournament ${id}`)}`,
    "END:VEVENT",
  ];
}

function wrap(events) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PotatoCup//Tournament//CN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function buildTournamentIcs({ id, name, scheduledTime, now = new Date() }) {
  const events = eventLines({ id, name, scheduledTime }, now);
  return events.length ? wrap(events) : null;
}

export function buildCalendarFeed(tournaments, now = new Date()) {
  const events = tournaments.flatMap((tournament) =>
    eventLines(tournament, now),
  );
  return wrap(events);
}
