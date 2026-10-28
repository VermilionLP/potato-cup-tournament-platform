// Which vehicle pool (line-up) a Liquipedia event used:
//   prop        螺旋桨 (Prop Line-up)
//   top-jet     顶级喷气: jet events before Weekly #23 (TOP_JET_UNTIL)
//   legacy-jet  早期喷气 (Legacy Jet / Top Jet Line-up from Weekly #23 on)
//   proleague   Pro League BVR (Pro League Line-up)
//
// Order: the event's own exceptions, then the "Line-up" line in the page's
// Format section, then the event name / page title. Jet events before 2026
// are jet events; anything that names no line-up is Prop. A jet event dated
// before Weekly #23 is Top Jet.

import { TOP_JET_UNTIL } from '../tournament-config.js';

// Organisers' decisions for events whose page names no line-up. Matched
// on the page title and its subpages.
const BY_TITLE = [
  ['Potato Cup Weekly/14', 'legacy-jet'],
  ['Potato Cup Weekly/16', 'legacy-jet'],
  ['Potato Cup/2026/June', 'prop'],
  ['Potato Cup/2026/Aug', 'legacy-jet'],
];

const LINEUP_LINE = /^[*#:\s]*(?:'''\s*)?([^\n]*?)\s*line-?\s?up\b/gim;

function poolFromText(text) {
  const t = String(text || '').toLowerCase();
  // "Prop League" on the BVR page is a typo for Pro League: check leagues first.
  if (/\bpro\s*-?\s*league\b|\bprop league\b|\bbvr\b/.test(t)) return 'proleague';
  // "Top Jet" (Weekly #19, #20, #25): a jet event, sorted by date below.
  if (/\blegacy\s*-?\s*jet\b|\btop\s*jet\b/.test(t)) return 'legacy-jet';
  if (/\bprop\b/.test(t)) return 'prop';
  return null;
}

/** The ==Format== section of a page (up to the next heading), or ''. */
export function formatSection(wikitext) {
  const text = String(wikitext || '');
  const start = text.search(/^==+\s*Format\s*==+/im);
  if (start < 0) return '';
  const rest = text.slice(start).replace(/^[^\n]*\n?/, '');
  const end = rest.search(/^==[^=]/m);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * @param {{ title: string, name?: string, wikitext?: string, date?: string|null }} page
 * @returns {'prop'|'top-jet'|'legacy-jet'|'proleague'}
 */
export function detectVehiclePool(page) {
  const pool = jetOrOther(page);
  if (pool === 'legacy-jet' && page.date && String(page.date).slice(0, 10) < TOP_JET_UNTIL) return 'top-jet';
  return pool;
}

function jetOrOther({ title, name = '', wikitext = '', date = null }) {
  for (const [prefix, pool] of BY_TITLE) {
    if (title === prefix || String(title).startsWith(`${prefix}/`)) return pool;
  }

  for (const m of formatSection(wikitext).matchAll(LINEUP_LINE)) {
    const pool = poolFromText(m[1]);
    if (pool) return pool;
  }

  const label = `${title} ${name}`;
  if (/\bjet\b/i.test(label) && !/\blegacy\s*jet\b/i.test(label)) {
    if (!date || date < '2026-01-01') return 'legacy-jet';
  }
  return poolFromText(label) || (/\bjet\b/i.test(label) ? 'proleague' : 'prop');
}
