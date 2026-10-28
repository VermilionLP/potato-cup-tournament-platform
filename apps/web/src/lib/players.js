export const PLAYER_ACTIVE_DAYS = 365;

export function isRecentlySeen(player, now = Date.now()) {
  const value = typeof player === "string" ? player : player?.last_seen_at;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return now - time <= PLAYER_ACTIVE_DAYS * 24 * 60 * 60 * 1000;
}

/** Players whose ID, display name or team contains the query. */
export function filterPlayers(players = [], query = "") {
  const q = String(query).toLowerCase();
  return players.filter(
    (p) => p.id.toLowerCase().includes(q) || (p.display_name || "").toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q),
  );
}

/** The list with player `id` moved to the front. */
export function mineFirst(list = [], id = "") {
  const me = list.findIndex((p) => p.id === id);
  return me > 0 ? [list[me], ...list.slice(0, me), ...list.slice(me + 1)] : list;
}

/** Liquipedia page of a player's `link` (a page name or a full URL). */
export function wikiUrl(link) {
  return String(link).startsWith("http") ? link : `https://liquipedia.net/warthunder/${link}`;
}

const GRADIENTS = [
  "from-amber-500 to-orange-500",
  "from-purple-500 to-indigo-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-fuchsia-500",
];

/** Avatar gradient for a player, stable per ID. */
export function playerGradient(id) {
  let s = 0;
  for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
  return GRADIENTS[s % GRADIENTS.length];
}
