// Who won a finished event, for the championship board on the stats page.
// Pure functions, no database access.

import { computeStandings, SWISS_BRACKET } from './swiss.js';

const GROUP_STAGE = new Set([SWISS_BRACKET, 'gse', 'gwb', 'glb']);
const decided = (m) => (m.status === 'completed' || m.status === 'walkover') && m.winner_id;

/** Qualifiers decide who reaches an event; winning one is not a title. */
export function isQualifierEvent(t) {
  return /qualifier|资格赛/i.test(`${t.source_title || ''} ${t.name || ''}`);
}

/**
 * Champion of a completed event, or null. `matches`: the event's matches;
 * `players`: [{ id, seed }] (only needed for single-stage Swiss).
 * Mirrors the podium on the tournament page: the decided grand final (its
 * reset if played) in double elimination, the final otherwise, and the top
 * of the standings in a single-stage Swiss event.
 */
export function tournamentChampion(t, matches, players = []) {
  if (!t || t.status !== 'completed') return null;
  if (t.format === 'swiss' && !t.playoff_format) {
    const sw = matches.filter((m) => m.bracket === SWISS_BRACKET);
    if (!sw.length) return null;
    return computeStandings(players, sw)[0]?.player_id ?? null;
  }
  const playoff = matches.filter((m) => !GROUP_STAGE.has(m.bracket));
  const doubleElim = t.playoff_format ? t.playoff_format === 'double_elim' : t.format === 'double_elim';
  if (doubleElim) {
    const finals = playoff.filter((m) => m.bracket === 'gf' && decided(m)).sort((a, b) => b.position - a.position);
    return finals[0]?.winner_id ?? null;
  }
  const final = playoff.find((m) => m.round === 1 && m.position === 1 && (m.bracket === 'main' || !m.bracket));
  return final && decided(final) ? final.winner_id : null;
}
