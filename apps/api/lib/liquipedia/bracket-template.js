// Liquipedia bracket templates (commons "Template:Bracket/<id>") describe a
// bracket as {{TemplateMatch}} entries: matchid R01-M005, the matches whose
// winners fill its upper (toupper) and lower (tolower) slot, a column header
// whose first letter marks the side (u = upper, l = lower, r = single), and
// optional bracket-reset / third-place matches.

import { parseTemplates, stripComments } from './wikitext.js';

/** "R01-M005" -> "R1M5"; "RxMBR" stays. */
export function pageKey(matchId) {
  const m = /^R(\d+)-M(\d+)$/.exec(matchId);
  return m ? `R${Number(m[1])}M${Number(m[2])}` : matchId;
}

function headerSide(header) {
  const token = String(header || '').split('!').filter(Boolean)[0] || '';
  if (/^tp/i.test(token)) return 'tp';
  if (/^l/i.test(token)) return 'l';
  if (/^u/i.test(token)) return 'u';
  if (/^r/i.test(token)) return 'r';
  return null;
}

/**
 * Parses the template wikitext into { matches: Map<pageKey, node> } where a
 * node is { key, R, M, upper, lower, side, root, reset, thirdPlace } and
 * upper/lower are page keys of feeder matches (or null).
 */
export function parseBracketTemplate(wikitext) {
  const nodes = new Map();
  for (const tpl of parseTemplates(stripComments(wikitext))) {
    if (tpl.name !== 'TemplateMatch') continue;
    const p = tpl.params;
    const id = (p.matchid || '').trim();
    if (!id) continue;
    const rm = /^R(\d+)-M(\d+)$/.exec(id);
    nodes.set(pageKey(id), {
      key: pageKey(id),
      R: rm ? Number(rm[1]) : null,
      M: rm ? Number(rm[2]) : null,
      upper: p.toupper ? pageKey(p.toupper.trim()) : null,
      lower: p.tolower ? pageKey(p.tolower.trim()) : null,
      header: (p.header || '').trim(),
      root: /^true$/i.test(p.root || ''),
      reset: p.bracketreset ? pageKey(p.bracketreset.trim()) : null,
      thirdPlace: p.thirdplace ? pageKey(p.thirdplace.trim()) : null,
      side: null,
    });
  }

  // Sides: a header applies to its match and the following matches of the
  // same column until the next header.
  const byColumn = new Map();
  for (const n of nodes.values()) {
    if (n.R === null) continue;
    if (!byColumn.has(n.R)) byColumn.set(n.R, []);
    byColumn.get(n.R).push(n);
  }
  for (const column of byColumn.values()) {
    column.sort((a, b) => a.M - b.M);
    let side = 'u';
    for (const n of column) {
      side = headerSide(n.header) || side;
      n.side = side === 'r' ? 'u' : side;
    }
  }
  for (const n of nodes.values()) {
    if (n.key === 'RxMTP') n.side = 'tp';
    if (n.key === 'RxMBR') n.side = 'reset';
  }

  // Parent links (which match a winner moves on to).
  for (const n of nodes.values()) n.parent = null;
  for (const n of nodes.values()) {
    if (n.upper && nodes.has(n.upper)) nodes.get(n.upper).parent = { key: n.key, slot: 1 };
    if (n.lower && nodes.has(n.lower)) nodes.get(n.lower).parent = { key: n.key, slot: 2 };
  }
  return { matches: nodes };
}

/** True when the template has a lower bracket. */
export function isDoubleElimination(template) {
  return [...template.matches.values()].some((n) => n.side === 'l');
}
