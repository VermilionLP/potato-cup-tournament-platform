// Player nationality from Liquipedia. Sources, best first:
// 1. the player's own page ({{Infobox player|country=...}});
// 2. the most recent tournament page that lists a flag for the player
//    (participant tables "|p3=Name|p3flag=ru" and match opponents
//    "{{1Opponent|Name|flag=ru}}").
// Pure: no network or database access.

import { normalizeCountry } from './countries.js';
import { nameKey } from './convert.js';
import { parseInfobox } from './page.js';
import { findTemplate, parseTemplates, resolveMagic, stripComments } from './wikitext.js';

/** Country code from a player page, or null. */
export function playerPageCountry(wikitext) {
  const tpl = findTemplate(stripComments(wikitext), 'Infobox player');
  if (!tpl) return null;
  return normalizeCountry(tpl.params.country || tpl.params.nationality || tpl.params.flag);
}

const OPPONENTS = ['1Opponent', 'SoloOpponent', 'Opponent', 'Player'];

// Every (name, flag) pair on a tournament page, at any nesting depth;
// flag is null where the page gives none.
function pageFlags(wikitext) {
  const pairs = [];
  const visit = (text) => {
    for (const tpl of parseTemplates(text)) {
      const p = tpl.params;
      if (OPPONENTS.includes(tpl.name)) {
        const name = resolveMagic(p['1'] || p.p1 || p.name || '');
        const flag = normalizeCountry(p.flag || p.p1flag);
        if (name && !/^(tbd|tba|bye)$/i.test(name)) pairs.push([name, flag]);
      }
      for (const [k, v] of Object.entries(p)) {
        const m = /^p(\d+)$/.exec(k);
        if (m && p[`p${m[1]}flag`] !== undefined) {
          const name = resolveMagic(v);
          const flag = normalizeCountry(p[`p${m[1]}flag`]);
          if (name && !name.includes('{{')) pairs.push([name, flag]);
        }
        if (v.includes('{{')) visit(v);
      }
    }
  };
  visit(stripComments(wikitext));
  return pairs;
}

/** Every player name mentioned on the given tournament pages. */
export function namesOnPages(pages) {
  const names = new Set();
  for (const text of Object.values(pages)) for (const [name] of pageFlags(text || '')) names.add(name);
  return [...names];
}

/**
 * Nationalities by name key: Map<nameKey, { flag, source, from, conflicts }>
 * where source is 'player page' or the tournament page title, and conflicts
 * lists other flags seen for the same player on tournament pages.
 */
export function collectNationalities({ pages, playerPages = {} }) {
  const byKey = new Map();
  const seen = new Map(); // key -> Map(flag -> latest date)
  const dated = Object.entries(pages)
    .map(([title, text]) => ({ title, text, date: (/(\d{4}-\d{2}-\d{2})/.exec(parseInfobox(text || '', title)?.date || '') || [])[1] || '' }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  for (const { title, text, date } of dated) {
    for (const [name, flag] of pageFlags(text || '')) {
      if (!flag) continue;
      const key = nameKey(name);
      byKey.set(key, { flag, source: title, from: name });
      if (!seen.has(key)) seen.set(key, new Map());
      seen.get(key).set(flag, date);
    }
  }
  for (const [name, text] of Object.entries(playerPages)) {
    const flag = playerPageCountry(text);
    if (flag) byKey.set(nameKey(name), { flag, source: 'player page', from: name });
  }
  for (const [key, info] of byKey) {
    info.conflicts = [...(seen.get(key)?.keys() || [])].filter((f) => f !== info.flag);
  }
  return byKey;
}

/**
 * Flag changes for platform players. `players`: [{ id, flag, imported }]
 * where imported means the player only appears in imported events.
 * A flag is filled in when the player has none or only came from the
 * import; a different flag on a platform player is a conflict unless
 * `overwrite` is set.
 */
export function planFlagUpdates({ players, nationalities, overwrite = false }) {
  const updates = [];
  const conflicts = [];
  const missing = [];
  for (const p of players) {
    const info = nationalities.get(nameKey(p.id));
    if (!info) {
      if (!p.flag) missing.push(p.id);
      continue;
    }
    const current = String(p.flag || '').toLowerCase();
    if (current === info.flag) continue;
    const change = { id: p.id, from: current || null, to: info.flag, source: info.source, otherFlags: info.conflicts };
    if (!current || p.imported || overwrite) updates.push(change);
    else conflicts.push(change);
  }
  return { updates, conflicts, missing };
}
