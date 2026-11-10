// iCalendar (.ics) for the events: one event's file, and the subscription
// feeds (all upcoming events, or one player's) that phone and desktop
// calendars poll. Their alarms ring on the device, so a player is reminded
// without any push service. scheduled_time is Beijing time (UTC+8).

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

const utcStamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

function icsStamp(year, month, day, hour, minute) {
  // scheduled_time is Asia/Shanghai (UTC+8); ICS dates use UTC.
  return utcStamp(new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0)));
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// Lines longer than 75 octets are folded (RFC 5545 3.1), without splitting
// a UTF-8 character.
export function foldLine(line) {
  const out = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    const limit = out.length ? 74 : 75; // a continuation starts with a space
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** The alarms of the feeds: minutes before the start, and what they say. */
export const ALARMS = {
  event: [{ minutes: 60, text: "1 小时后开赛" }],
  player: [
    { minutes: 60, text: "1 小时后开赛" },
    { minutes: 10, text: "10 分钟后开赛，请准备进入游戏" },
  ],
  checkin: { minutes: 30, text: "签到已开放，请在开赛前完成签到" },
};

function alarmLines({ minutes, text }) {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:-PT${minutes}M`,
    `DESCRIPTION:${escapeIcs(text)}`,
    "END:VALARM",
  ];
}

function eventLines(t, now, { alarms = [], origin = "", note = "" } = {}) {
  const start = parseScheduledDateTime(t.scheduledTime ?? t.scheduled_time);
  if (!start) return [];
  const url = origin ? `${origin}/tournament/${encodeURIComponent(t.id)}` : "";
  const description = [note, url || `Potato Cup Tournament ${t.id}`].filter(Boolean).join("\n");
  const updated = t.updated_at ? new Date(t.updated_at) : null;
  return [
    "BEGIN:VEVENT",
    `UID:suck-${escapeIcs(t.id)}@suck-tournament`,
    `DTSTAMP:${utcStamp(now)}`,
    ...(updated && !Number.isNaN(updated.getTime()) ? [`LAST-MODIFIED:${utcStamp(updated)}`] : []),
    `DTSTART:${icsStamp(start.year, start.month, start.day, start.hour, start.minute)}`,
    `DTEND:${icsStamp(start.year, start.month, start.day, start.hour + 2, start.minute)}`,
    `SUMMARY:${escapeIcs(t.name)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    ...(url ? [`URL:${url}`] : []),
    ...alarms.flatMap(alarmLines),
    "END:VEVENT",
  ];
}

function wrap(events, name = "") {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PotatoCup//Tournament//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(name ? [`X-WR-CALNAME:${escapeIcs(name)}`, "X-WR-TIMEZONE:Asia/Shanghai"] : []),
    // Subscribed calendars look for changes every hour.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events,
    "END:VCALENDAR",
  ].map(foldLine).join("\r\n") + "\r\n";
}

export function buildTournamentIcs({ id, name, scheduledTime, origin = "", now = new Date() }) {
  const events = eventLines({ id, name, scheduledTime }, now, { alarms: ALARMS.event, origin });
  return events.length ? wrap(events) : null;
}

/**
 * A subscription feed. `player`: the player's own feed (their events, with
 * the 10-minute alarm and, where the event asks for it, the check-in one).
 */
export function buildCalendarFeed(tournaments, now = new Date(), { origin = "", player = null } = {}) {
  const events = tournaments.flatMap((t) => {
    if (!player) return eventLines(t, now, { alarms: ALARMS.event, origin });
    const checkin = t.checkin_enabled && t.status === "registration";
    return eventLines(t, now, {
      origin,
      alarms: [...ALARMS.player, ...(checkin ? [ALARMS.checkin] : [])],
      note: checkin ? "你已报名本场比赛。签到在开赛前 30 分钟开放，未签到可能被移出。" : "你已报名本场比赛。",
    });
  });
  return wrap(events, player ? `Potato Cup · ${player}` : "Potato Cup 赛事");
}
