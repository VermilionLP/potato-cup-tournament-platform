// Time and custom votes of an event in the voting stage. Pure helpers (no
// Svelte, no DOM) so they can be tested with node --test.

// Half-hour slots offered when proposing a new time.
export const VOTE_TIME_SLOTS = Array.from({ length: 22 }, (_, i) => {
  const minutes = 13 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 ? "30" : "00"}`;
});

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const pad = (n) => String(n).padStart(2, "0");

/** The next `weekday` (0 = Sunday) at hour:minute after `now`. */
export function nextVoteOccurrence(weekday, hour, minute, now = new Date()) {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  let delta = (weekday - d.getDay() + 7) % 7;
  if (delta === 0 && d.getTime() <= now.getTime()) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}

/** Local "YYYY-MM-DDTHH:mm:00", the format votes are stored in. */
export function voteIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/**
 * Up to six suggested times: the most played slots in past events, the
 * usual Thursday 20:30 and weekend afternoons, `weekOffset` weeks ahead.
 */
export function suggestedVoteTimes(playTimes, weekOffset = 0, now = new Date()) {
  const fallback = [
    { weekday: 4, hour: 20, minute: 30 },
    { weekday: 6, hour: 20, minute: 30 },
    { weekday: 0, hour: 20, minute: 30 },
    { weekday: 6, hour: 15, minute: 0 },
    { weekday: 0, hour: 15, minute: 0 },
  ];
  const historical = (playTimes?.top_slots || []).slice(0, 3).map((slot) => {
    const [hour, minute] = String(slot.time).split(":").map(Number);
    return { weekday: slot.weekday, hour, minute };
  });
  const extra = [
    { weekday: 4, hour: 20, minute: 30 },
    { weekday: 6, hour: 15, minute: 0 },
    { weekday: 0, hour: 15, minute: 0 },
  ];
  const anchor = new Date(now.getTime() + weekOffset * 7 * 24 * 3600 * 1000);
  const seen = new Set();
  const out = [];
  for (const spec of [...historical, ...extra, ...fallback]) {
    const iso = voteIso(nextVoteOccurrence(spec.weekday, spec.hour, spec.minute, anchor));
    if (seen.has(iso)) continue;
    seen.add(iso);
    out.push({ proposed_time: iso, suggested: true });
    if (out.length >= 6) break;
  }
  return out;
}

/** Voted times plus suggested ones without votes, in time order. */
export function voteOptionsFrom(votes = [], suggested = []) {
  const map = {};
  for (const v of votes) {
    const t = v.proposed_time;
    if (!map[t]) map[t] = { proposed_time: t, count: 0, voters: [] };
    map[t].count++;
    map[t].voters.push(v);
  }
  const suggestedTimes = new Set(suggested.map((q) => q.proposed_time));
  for (const q of suggested) {
    if (!map[q.proposed_time]) map[q.proposed_time] = { proposed_time: q.proposed_time, count: 0, voters: [] };
  }
  return Object.values(map)
    .map((opt) => ({ ...opt, suggested: suggestedTimes.has(opt.proposed_time) }))
    .sort((a, b) => a.proposed_time.localeCompare(b.proposed_time));
}

/** "10/31 周六" for a "YYYY-MM-DD" date. */
export function formatDateHeader(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  if (isNaN(date.getTime())) return dateStr;
  return `${date.getMonth() + 1}/${date.getDate()} ${WEEKDAYS[date.getDay()]}`;
}

/** Options grouped by date: [{ date, formattedDate, options: [{ ...opt, timeOnly }] }]. */
export function groupVoteDates(options = []) {
  const byDate = {};
  for (const opt of options) {
    const [date, time] = opt.proposed_time.split("T");
    if (!byDate[date]) byDate[date] = { date, formattedDate: formatDateHeader(date), options: [] };
    byDate[date].options.push({ ...opt, timeOnly: time ? time.substring(0, 5) : "00:00" });
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

/** "2026-10-31 (周六) 20:30"; the input unchanged when it is not a date. */
export function formatVoteTime(timeStr) {
  if (!timeStr) return "";
  const date = new Date(String(timeStr).replace(" ", "T"));
  if (isNaN(date.getTime())) return timeStr;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} (${WEEKDAYS[date.getDay()]}) ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Votes for times already in the past. */
export function pastVotes(votes = [], now = Date.now()) {
  return votes.filter((vote) => {
    const time = new Date(vote.proposed_time).getTime();
    return Number.isFinite(time) && time < now;
  });
}

/** Custom votes by topic: [{ topic, options: [{ value, count, voters }] }], most votes first. */
export function customVoteTopics(customVotes = []) {
  const topics = {};
  for (const cv of customVotes) {
    const options = (topics[cv.topic] ||= {});
    const option = (options[cv.value] ||= { value: cv.value, count: 0, voters: [] });
    option.count++;
    option.voters.push(cv);
  }
  return Object.entries(topics)
    .map(([topic, options]) => ({ topic, options: Object.values(options).sort((a, b) => b.count - a.count) }))
    .sort((a, b) => a.topic.localeCompare(b.topic));
}
