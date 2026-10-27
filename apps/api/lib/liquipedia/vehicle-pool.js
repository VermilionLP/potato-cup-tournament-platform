// Which vehicle pool (line-up) a Liquipedia event used:
//   prop        螺旋桨 (Prop Line-up)
//   legacy-jet  早期喷气 (Legacy Jet Line-up)
//   proleague   Pro League BVR (Pro League / Top Jet Line-up)
//
// Order: the event's own exceptions, then the "Line-up" line in the page's
// Format section, then the event name / page title. Jet events before 2026
// are Legacy Jet; anything that names no line-up is Prop.

// Organisers' decisions for events whose page names no line-up (or the wrong one). Matched
// on the page title and its subpages.
const BY_TITLE = [
  ['Potato Cup Weekly/14', 'legacy-jet'],
  ['Potato Cup Weekly/16', 'legacy-jet'],
  // Their pages say "Top Jet Line-up", but they used the Legacy Jet pool.
  ['Potato Cup Weekly/19', 'legacy-jet'],
  ['Potato Cup Weekly/20', 'legacy-jet'],
  ['Potato Cup/2026/June', 'prop'],
  ['Potato Cup/2026/Aug', 'legacy-jet'],
];

const LINEUP_LINE = /^[*#:\s]*(?:'''\s*)?([^\n]*?)\s*line-?\s?up\b/gim;

function poolFromText(text) {
  const t = String(text || '').toLowerCase();
  // "Prop League" on the BVR page is a typo for Pro League: check leagues first.
  if (/\bpro\s*-?\s*league\b|\bprop league\b|\bbvr\b|\btop jet\b/.test(t)) return 'proleague';
  if (/\blegacy\s*-?\s*jet\b/.test(t)) return 'legacy-jet';
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
 * @returns {'prop'|'legacy-jet'|'proleague'}
 */
export function detectVehiclePool({ title, name = '', wikitext = '', date = null }) {
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
