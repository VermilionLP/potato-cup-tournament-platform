// Points from a Liquipedia prize pool: the {{SoloPrizePool}} column that
// links to a Potato Cup leaderboard (Potato_Cup/Leaderboard/<year>).
//   |points1=PotatoCup Leaderboard 2026|points1link=Potato_Cup/Leaderboard/2026
//   |{{Slot|place=3-4|points=35}}   (or points1= / points2= with several columns)

import { findTemplate, parseTemplates } from './wikitext.js';

/**
 * { table: [{ from, to, points }], season, kind } or null. kind is
 * 'monthly' when the winner qualifies for a Potato Cup Winter event
 * (|qualifies1=Potato_Cup/2026/Winter/Prop), else 'weekly'.
 */
export function parsePrizePoolPoints(wikitext) {
  const pool = findTemplate(wikitext, 'SoloPrizePool', 'Prize pool start', 'PrizePool');
  if (!pool) return null;
  let column = null;
  let season = '';
  for (const [key, value] of Object.entries(pool.params)) {
    const m = /^points(\d*)link$/i.exec(key);
    const year = /Potato[_ ]Cup\/Leaderboard\/(\d{4})/i.exec(value);
    if (m && year) {
      column = m[1] || '1';
      season = year[1];
      break;
    }
  }
  if (!column) return null;
  const table = [];
  for (const [key, value] of Object.entries(pool.params)) {
    if (!/^\d+$/.test(key)) continue;
    const slot = parseTemplates(value).find((t) => /^slot$/i.test(t.name));
    if (!slot) continue;
    const raw = slot.params[`points${column}`] ?? (column === '1' ? slot.params.points : undefined);
    const place = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(String(slot.params.place || '').trim());
    const points = Number(String(raw ?? '').replace(/,/g, ''));
    if (!place || raw === undefined || raw === '' || !Number.isFinite(points)) continue;
    table.push({ from: Number(place[1]), to: Number(place[2] || place[1]), points });
  }
  const kind = Object.entries(pool.params).some(([k, v]) => /^qualifies\d*$/i.test(k) && /Potato[_ ]Cup\/\d{4}\/Winter/i.test(v))
    ? 'monthly'
    : 'weekly';
  return table.length ? { table, season, kind } : null;
}
