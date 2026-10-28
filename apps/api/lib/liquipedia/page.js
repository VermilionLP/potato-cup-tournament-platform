// Reads the parts of a Liquipedia tournament page the importer needs.

import { normalizeName, parseTemplates, resolveMagic, stripComments } from './wikitext.js';

const OPPONENT_TEMPLATES = ['1Opponent', 'SoloOpponent', 'Opponent', 'Player'];
const TEAM_TEMPLATES = ['2Opponent', '2v2Opponent', 'TeamOpponent', '3Opponent', '4Opponent'];

/** "{{1Opponent|name|flag=cn|score=2}}" / "{{SoloOpponent|p1=name|...}}" -> { name, flag, score }. */
export function parseOpponent(value) {
  const tpl = parseTemplates(value)[0];
  if (!tpl) return null;
  if (TEAM_TEMPLATES.map(normalizeName).includes(tpl.name)) return { team: true };
  if (!OPPONENT_TEMPLATES.map(normalizeName).includes(tpl.name)) return null;
  const p = tpl.params;
  const name = resolveMagic(p['1'] || p.p1 || p.name || '');
  const flag = (p.flag || p.p1flag || '').trim();
  const score = (p.score ?? '').trim();
  if (!name || /^(tbd|tba|bye|)$/i.test(name)) return { name: null, flag, score };
  return { name, flag, score };
}

/** Parses one {{Match ...}} value. */
export function parseMatch(value) {
  const tpl = parseTemplates(value).find((t) => t.name === 'Match');
  if (!tpl) return null;
  const p = tpl.params;
  const maps = [];
  for (let i = 1; p[`map${i}`] !== undefined; i += 1) {
    const map = parseTemplates(p[`map${i}`])[0];
    if (map) maps.push({ winner: (map.params.winner || '').trim() });
  }
  return {
    opponent1: p.opponent1 ? parseOpponent(p.opponent1) : null,
    opponent2: p.opponent2 ? parseOpponent(p.opponent2) : null,
    winner: (p.winner || '').trim(),
    walkover: (p.walkover || '').trim(),
    bestof: Number(p.bestof) || null,
    date: (p.date || '').trim(),
    section: resolveMagic(p.matchsection || ''),
    maps,
  };
}

const WIN = /^w$/i;
const LOSS = /^(ff|l|dq|-)$/i;

/**
 * Outcome of a parsed match:
 * { kind: 'played' | 'walkover' | 'bye' | 'unplayed' | 'team', p1, p2, s1, s2, winner (1|2|null), flags }
 */
export function matchResult(match) {
  if (!match) return { kind: 'unplayed', p1: null, p2: null, s1: 0, s2: 0, winner: null };
  const o1 = match.opponent1;
  const o2 = match.opponent2;
  if (o1?.team || o2?.team) return { kind: 'team', p1: null, p2: null, s1: 0, s2: 0, winner: null };
  const p1 = o1?.name || null;
  const p2 = o2?.name || null;
  const flags = { [p1]: o1?.flag, [p2]: o2?.flag };
  const base = { p1, p2, flags };
  if (!p1 || !p2) {
    const only = p1 || p2;
    return { ...base, kind: only ? 'bye' : 'unplayed', s1: 0, s2: 0, winner: only ? (p1 ? 1 : 2) : null };
  }

  const sc1 = o1.score;
  const sc2 = o2.score;
  const explicit = match.winner === '1' ? 1 : match.winner === '2' ? 2 : null;
  const wo = match.walkover === '1' ? 1 : match.walkover === '2' ? 2 : null;
  if (wo || WIN.test(sc1) || WIN.test(sc2) || LOSS.test(sc1) || LOSS.test(sc2)) {
    let winner = wo;
    if (!winner) {
      if (WIN.test(sc1) || LOSS.test(sc2)) winner = 1;
      else if (WIN.test(sc2) || LOSS.test(sc1)) winner = 2;
    }
    if (!winner) return { ...base, kind: 'unplayed', s1: 0, s2: 0, winner: null };
    return { ...base, kind: 'walkover', s1: 0, s2: 0, winner };
  }

  let s1 = sc1 === '' ? null : Number(sc1);
  let s2 = sc2 === '' ? null : Number(sc2);
  if ((s1 === null || Number.isNaN(s1)) && (s2 === null || Number.isNaN(s2)) && match.maps.length) {
    s1 = match.maps.filter((m) => m.winner === '1').length;
    s2 = match.maps.filter((m) => m.winner === '2').length;
  }
  const numeric = Number.isFinite(s1) && Number.isFinite(s2);
  if (numeric && (s1 !== s2 || explicit)) {
    return { ...base, kind: 'played', s1, s2, winner: explicit || (s1 > s2 ? 1 : 2) };
  }
  if (explicit) {
    return { ...base, kind: 'played', s1: explicit === 1 ? 1 : 0, s2: explicit === 2 ? 1 : 0, winner: explicit };
  }
  return { ...base, kind: 'unplayed', s1: 0, s2: 0, winner: null };
}

/** Infobox fields with magic words resolved. */
export function parseInfobox(wikitext, title) {
  const tpl = parseTemplates(stripComments(wikitext)).find((t) => t.name === 'Infobox league');
  if (!tpl) return null;
  const p = tpl.params;
  const get = (k) => resolveMagic(p[k] || '', title);
  return {
    name: get('name') || title,
    tickername: get('tickername'),
    date: get('edate') || get('date') || get('sdate'),
    sdate: get('sdate') || get('date'),
    mode: get('mode'),
    vehicle: get('vehicle'),
    format: get('format'),
    playerNumber: Number(get('player_number')) || null,
    liquipediatier: get('liquipediatier'),
    tiertype: get('liquipediatiertype') || get('tiertype'),
  };
}

const BLOCK_NAMES = ['Bracket', 'Matchlist', 'GroupTableLeague', 'SwissTableLeague'];

/**
 * Result blocks in page order:
 * - { kind: 'bracket', template, id, title, matches: { R1M1: match, RxMBR: match, ... } }
 * - { kind: 'matchlist', id, title, matches: [{ key, header, ...match }] }
 * - { kind: 'group', id, title, players: [name] }
 * - { kind: 'swisstable', title }
 */
export function parseBlocks(wikitext, title = '') {
  const blocks = [];
  for (const tpl of parseTemplates(stripComments(wikitext))) {
    if (!BLOCK_NAMES.includes(tpl.name)) continue;
    const p = tpl.params;
    if (tpl.name === 'Bracket') {
      const matches = {};
      for (const [key, value] of Object.entries(p)) {
        if (/^R\d+M\d+$|^RxM(BR|TP)$/i.test(key)) {
          const m = parseMatch(value);
          if (m) matches[key] = m;
        }
      }
      blocks.push({ kind: 'bracket', template: normalizeName(p['1'] || ''), id: p.id || '', title: resolveMagic(p.title || '', title), matches });
    } else if (tpl.name === 'Matchlist') {
      const keys = Object.keys(p)
        .filter((k) => /^M\d+$/.test(k))
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
      const matches = keys
        .map((key) => ({ key, header: resolveMagic(p[`${key}header`] || ''), match: parseMatch(p[key]) }))
        .filter((m) => m.match);
      blocks.push({ kind: 'matchlist', id: p.id || '', title: resolveMagic(p.title || '', title), matches });
    } else if (tpl.name === 'GroupTableLeague') {
      const players = Object.keys(p)
        .filter((k) => /^p\d+$/.test(k))
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
        .map((k) => resolveMagic(p[k]))
        .filter(Boolean);
      blocks.push({ kind: 'group', id: p.id || '', title: resolveMagic(p.title || '', title), players });
    } else {
      blocks.push({ kind: 'swisstable', title: resolveMagic(p.title || '', title) });
    }
  }
  return blocks;
}
