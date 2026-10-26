// Battle.net account helpers shared by the players and tournaments routes.
// These used to live in routes/replays.js; they are independent of replay
// parsing and are needed for account de-duplication.

// Normalize a Battle.net account reference to a stable `region/subregion/toon` key.
// Handles profile URLs, `toon_handle` strings, and already-normalized keys.
export function normalizeBnetUrl(input) {
  if (!input || typeof input !== 'string') return '';
  const s = input.trim().toLowerCase();
  if (!s) return '';
  const profile = s.match(/profile\/(\d+)\/(\d+)\/(\d+)/);
  if (profile) return `${profile[1]}/${profile[2]}/${profile[3]}`;
  const handle = s.match(/^(\d+)-[^-]+-(\d+)-(\d+)$/);
  if (handle) return `${handle[1]}/${handle[2]}/${handle[3]}`;
  return s;
}

// Every account key a stored account entry could resolve to.
export function bnetEntryAccountKeys(entry) {
  const keys = [];
  if (!entry) return keys;
  if (typeof entry === 'string') {
    const k = normalizeBnetUrl(entry);
    if (k) keys.push(k);
    return keys;
  }
  for (const field of [entry.url, entry.toon_handle, entry.toonHandle, entry.account_key]) {
    const k = normalizeBnetUrl(field);
    if (k) keys.push(k);
  }
  return keys;
}

export function bnetEntryKey(entry) {
  return bnetEntryAccountKeys(entry)[0] || '';
}

export function parseBnetIdsField(playerBnetIds) {
  let bnetIds = [];
  if (playerBnetIds) {
    try {
      bnetIds = typeof playerBnetIds === 'string' ? JSON.parse(playerBnetIds) : playerBnetIds;
    } catch (_) {}
  }
  return Array.isArray(bnetIds) ? bnetIds : [];
}

// Normalize a tournament_player_accounts row into a bnet_ids-like entry.
export function tournamentAccountToBnetEntry(a) {
  return {
    id: a.account_name || a.id || '',
    url: a.url || '',
    toon_handle: a.toon_handle || '',
    region: a.region || null,
    subregion: a.subregion != null ? a.subregion : null
  };
}

// Battle.net server labels by region id (1 us, 2 eu, 3 kr, 5 cn, 6 sea).
const REGION_LABELS = { 1: '美服', 2: '欧服', 3: '亚服', 5: '国服', 6: '东南亚', 98: '—' };
const SUBREGION_LABELS = { '1/2': '拉美', '2/2': '俄服', '3/2': '台服' };

export function regionLabel(regionKey) {
  const m = String(regionKey || '').match(/^(\d+)\/(\d+)/);
  if (!m) return '';
  const r = parseInt(m[1], 10);
  const s = parseInt(m[2], 10);
  return SUBREGION_LABELS[`${r}/${s}`] || REGION_LABELS[r] || '';
}

export function accountEntryRegionLabel(entry) {
  if (!entry) return '';
  const key = normalizeBnetUrl(entry.url || entry.toon_handle || entry.account_key || '');
  return regionLabel(key);
}

// Collapse entries that resolve to the same account URL into one (keeps the url).
export function dedupeAccountEntries(bnetIds) {
  const byKey = new Map();
  const out = [];
  for (const e of bnetIds) {
    const k = bnetEntryKey(e);
    if (!k) { out.push(e); continue; }
    if (byKey.has(k)) {
      const prev = byKey.get(k);
      const eObj = typeof e === 'string' ? { id: e, url: '' } : e;
      if (!prev.url && eObj.url) { prev.url = eObj.url; prev.toon_handle = prev.toon_handle || eObj.toon_handle || null; }
      if (eObj.id) prev.id = eObj.id;
    } else {
      const clone = typeof e === 'string' ? { id: e, url: '' } : { ...e };
      byKey.set(k, clone);
      out.push(clone);
    }
  }
  return out;
}
