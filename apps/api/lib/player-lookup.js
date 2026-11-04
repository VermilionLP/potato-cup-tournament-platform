// Sign-in help: is the name a visitor types already a player? Many players
// have a record (past events, imported history) without knowing it, and
// typing "vermilion" or "Vermilion_" made a second player. Pure, tested.

/** Lower case, without spaces and the usual separators. */
export function normalizeName(name) {
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_\-.·・|]+/g, '');
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * How close `candidate` is to the typed name: 0 same apart from case /
 * separators, 1 one typo, 2 two typos or one contains the other; null not
 * similar. Short names need closer matches.
 */
export function similarity(typed, candidate) {
  const a = normalizeName(typed);
  const b = normalizeName(candidate);
  if (!a || !b) return null;
  if (a === b) return 0;
  const max = Math.min(a.length, b.length) >= 6 ? 2 : Math.min(a.length, b.length) >= 4 ? 1 : 0;
  const d = max ? editDistance(a, b, max) : max + 1;
  if (d <= max) return d;
  if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return 2;
  return null;
}

/**
 * players: [{ id, events, last_event, last_seen_at, key_bound }];
 * aliases: [{ alias, player_id }] (old IDs of renamed / merged players).
 * Returns { exact, alias, similar } for the typed name.
 */
export function lookupPlayerName(name, players = [], aliases = [], limit = 5) {
  const typed = String(name || '').trim();
  if (!typed) return { exact: null, alias: null, similar: [] };
  const byId = new Map(players.map((p) => [p.id, p]));
  const exact = byId.get(typed) || null;

  const aliasRow = exact ? null : aliases.find((a) => a.alias === typed && byId.has(a.player_id));
  const alias = aliasRow ? { alias: typed, player: byId.get(aliasRow.player_id) } : null;

  const seen = new Set([exact?.id, alias?.player.id].filter(Boolean));
  const scored = [];
  for (const p of players) {
    if (seen.has(p.id)) continue;
    const s = similarity(typed, p.id);
    if (s !== null) scored.push({ p, s });
  }
  for (const a of aliases) {
    const p = byId.get(a.player_id);
    if (!p || seen.has(p.id) || scored.some((x) => x.p.id === p.id)) continue;
    const s = similarity(typed, a.alias);
    if (s !== null) scored.push({ p, s, via: a.alias });
  }
  scored.sort((x, y) => x.s - y.s || (y.p.events || 0) - (x.p.events || 0) || x.p.id.localeCompare(y.p.id));
  const similar = scored.slice(0, limit).map(({ p, s, via }) => ({ ...p, closeness: s, ...(via ? { via } : {}) }));
  return { exact, alias, similar };
}

const pairKey = (a, b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/**
 * Likely duplicate players for admins: pairs whose IDs differ only in case /
 * separators, a typo, or one containing the other (similarity above),
 * closest first. `dismissed` holds [a, b] pairs marked as different people.
 * Each pair suggests merging the player with fewer events into the other
 * (`from` → `into`).
 */
export function duplicatePairs(players = [], dismissed = [], limit = 50) {
  const skip = new Set(dismissed.map(([a, b]) => pairKey(a, b)));
  const norm = players.map((p) => ({ p, n: normalizeName(p.id) })).filter((x) => x.n);
  const pairs = [];
  for (let i = 0; i < norm.length; i += 1) {
    for (let j = i + 1; j < norm.length; j += 1) {
      const a = norm[i].p;
      const b = norm[j].p;
      if (skip.has(pairKey(a.id, b.id))) continue;
      const closeness = similarity(a.id, b.id);
      if (closeness === null) continue;
      const rank = (p) => [(p.events || 0), p.key_bound ? 1 : 0, p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0];
      const [ra, rb] = [rank(a), rank(b)];
      const aWins = ra[0] !== rb[0] ? ra[0] > rb[0] : ra[1] !== rb[1] ? ra[1] > rb[1] : ra[2] >= rb[2];
      pairs.push({ closeness, into: aWins ? a : b, from: aWins ? b : a });
    }
  }
  pairs.sort((x, y) => x.closeness - y.closeness || (y.into.events + y.from.events) - (x.into.events + x.from.events) || x.into.id.localeCompare(y.into.id));
  return pairs.slice(0, limit);
}
