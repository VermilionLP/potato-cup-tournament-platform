// Live channels: several streams of one event, each with its own live match
// and overlay scene / stage (GET /tournaments/:id → live_channels). Consoles
// pick a channel per event (remembered in this browser); overlays take it
// from ?channel=. Channel 1 is the default one.

export const MAX_LIVE_CHANNELS = 9;

/** Channel number from a URL parameter or storage; 1 when missing or invalid. */
export function parseChannel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LIVE_CHANNELS ? n : 1;
}

/** The event's state on one channel. */
export function channelState(tournament, channel = 1) {
  const row = (tournament?.live_channels || []).find((c) => Number(c.channel) === channel);
  if (row) return row;
  if (channel === 1 && tournament && !tournament.live_channels) {
    // An API from before channels: the top-level fields are channel 1.
    const { active_match_id = null, overlay_scene = "auto", overlay_round = null, overlay_stage = null } = tournament;
    return { channel: 1, active_match_id, overlay_scene, overlay_round, overlay_stage };
  }
  return { channel, active_match_id: null, overlay_scene: "auto", overlay_round: null, overlay_stage: null };
}

/**
 * The event as one channel sees it: its live match and overlay state in the
 * usual top-level fields, so the overlay and console code reads one channel.
 */
export function withChannel(tournament, channel = 1) {
  if (!tournament) return tournament;
  const { active_match_id, overlay_scene, overlay_round, overlay_stage } = channelState(tournament, channel);
  return { ...tournament, active_match_id, overlay_scene, overlay_round, overlay_stage, live_channel: channel };
}

/** Matches live on the other channels: match id -> channel. */
export function liveElsewhere(tournament, channel = 1) {
  const map = new Map();
  for (const c of tournament?.live_channels || []) {
    if (Number(c.channel) !== channel && c.active_match_id) map.set(c.active_match_id, Number(c.channel));
  }
  return map;
}

/**
 * Channels a console can pick: those in use (and the current one), plus the
 * next free number to start another stream, up to MAX_LIVE_CHANNELS.
 */
export function channelOptions(tournament, current = 1) {
  const used = new Set([1, current]);
  for (const c of tournament?.live_channels || []) {
    const inUse = c.active_match_id || (c.overlay_scene && c.overlay_scene !== "auto") || c.overlay_stage;
    if (inUse) used.add(Number(c.channel));
  }
  const max = Math.max(...used);
  if (max < MAX_LIVE_CHANNELS) used.add(max + 1);
  return [...used].sort((a, b) => a - b);
}

/** Overlay link of a channel: channel 1 keeps the plain link. */
export function channelUrl(url, channel = 1) {
  if (channel === 1) return url;
  return `${url}${url.includes("?") ? "&" : "?"}channel=${channel}`;
}

const channelKey = (tid) => `suck_live_channel:${tid}`;
const streamKey = (tid) => `suck_stream_mode:${tid}`;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: this page only
  }
}

/** This browser's channel for an event. */
export function savedChannel(tid) {
  return parseChannel(read(channelKey(tid)));
}

export function saveChannel(tid, channel) {
  write(channelKey(tid), String(parseChannel(channel)));
}

/** Whether this browser is in stream mode for an event. */
export function savedStreamMode(tid) {
  return read(streamKey(tid)) === "1";
}

export function saveStreamMode(tid, on) {
  write(streamKey(tid), on ? "1" : "0");
}
