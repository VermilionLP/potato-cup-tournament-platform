// Liquipedia page for an event, in the layout of the Potato Cup pages:
//   Swiss weekly               Potato_Cup_Weekly/12
//   double elimination         Potato_Cup/2026/Aug/Asia_Pacific
//   Swiss groups + playoff     Potato_Cup/2026/June/Europe
// Infobox, format, prize pool (the event's own points table plus the prize
// money from the export settings), participants, results, broadcasts.
// Pure: the route loads the event and passes it in.

import { createHash } from 'crypto';
import { LIQUIPEDIA_BRACKET_TEMPLATES } from '../bracket.js';
import { groupLabel } from '../group-stage.js';
import { normalizePlace } from './export-meta.js';
import { parseBracketTemplate } from './bracket-template.js';
import { DOUBLE_ELIM_TEMPLATE_MATCHES } from './de-templates.js';

const decided = (m) => m.status === 'completed' || m.status === 'walkover';
const isBye = (m) => decided(m) && (!m.player1_id || !m.player2_id);
const MODES = { ab: 'AB', rb: 'RB', sb: 'SB' };

/** 10-character match-group id (Liquipedia's length), stable per event. */
export function wikiId(eventId, suffix) {
  const hash = createHash('sha1').update(String(eventId)).digest('hex');
  const base = `pc${BigInt(`0x${hash.slice(0, 15)}`).toString(36)}`;
  const tail = String(suffix).replace(/[^a-z0-9]/gi, '').slice(0, 4);
  return (base.slice(0, 10 - tail.length) + tail).padEnd(10, '0');
}

/** "2026-08-15" and "20:00" from a stored Beijing time. */
function splitTime(raw) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(String(raw || ''));
  return { date: m?.[1] || '', time: m?.[2] || '' };
}

/** Best-of from the results: two wins of three -> Bo3. Null when unknown. */
export function inferBestOf(matches) {
  let wins = 0;
  for (const m of matches) {
    if (m.status !== 'completed' || !m.player1_id || !m.player2_id) continue;
    wins = Math.max(wins, Number(m.score1) || 0, Number(m.score2) || 0);
  }
  return wins ? 2 * wins - 1 : null;
}

const pow2 = (n) => 1 << Math.ceil(Math.log2(Math.max(2, n)));

// Liquipedia double-elimination templates for 4-16 players (byes left out).
export const DOUBLE_ELIM_TEMPLATES = {
  4: 'Bracket/4U2L1D',
  5: 'Bracket/2L1DH2LU2L2D',
  6: 'Bracket/4L2DSU4L1D',
  7: 'Bracket/2L1DH4LU2H2L1DLL1D',
  8: 'Bracket/8U4L2DSL1D',
  9: 'Bracket/2L1DH2LH4LU2L2DH2L1DLL1D',
  10: 'Bracket/4L2DH4LSU4L4DSL1D',
  11: 'Bracket/2L1DH2LH4L2DSLU2L2DH4L1DLL1D',
  12: 'Bracket/8L4DSSU8L2DSL1D',
  13: 'Bracket/2L1DH4LH4L2DSLU2H2L1DLL1DH4L1DLL1D',
  14: 'Bracket/4L2DH8LSU4H4L2DLL2DSL1D',
  15: 'Bracket/2L1DH4LH8LU2H2L1DLL1DH4L2DSL1DLL1D',
  16: 'Bracket/16U8L4DSL2DSL1D',
};

/** Liquipedia double-elimination template for n players, and whether its byes are left out. */
export function doubleElimTemplate(n) {
  if (DOUBLE_ELIM_TEMPLATES[n]) return { name: DOUBLE_ELIM_TEMPLATES[n], compact: true };
  const size = pow2(Math.max(4, n));
  const chain = [];
  for (let d = size / 4; d >= 1; d /= 2) chain.push(`${d}D`);
  return { name: `Bracket/${size}U${size / 2}L${chain.join('SL')}`, compact: n === size };
}

// Double-elimination groups without a grand final where the upper and the
// lower bracket winner advance (Potato_Cup/2026/Fall/Europe uses the 8).
export const DOUBLE_ELIM_GROUP_TEMPLATES = {
  4: 'Bracket/4-1Q-U-2L1D-1Q',
  5: 'Bracket/2L1DH2L-1Q-U-2L2D-1Q',
  6: 'Bracket/4L2DS-1Q-U-4L1D-1Q',
  7: 'Bracket/2L1DH4L-1Q-U-2H2L1DLL1D-1Q',
  8: 'Bracket/8-1Q-U-4L2DSL1D-1Q',
};

/**
 * Template of a double-elimination group of n players where `perGroup`
 * advance; null when none is known.
 */
export function doubleElimGroupTemplate(n, perGroup) {
  if (Number(perGroup) !== 2 || n < 4) return null;
  if (DOUBLE_ELIM_GROUP_TEMPLATES[n]) return { name: DOUBLE_ELIM_GROUP_TEMPLATES[n], compact: true };
  if (n !== pow2(n)) return null;
  const base = doubleElimTemplate(n).name.replace(/^Bracket\//, '');
  return { name: `Bracket/${base.replace(/^(\d+)U/, '$1-1Q-U-')}-1Q`, compact: true };
}

/** Single-elimination template for n players (byes left out up to 32). */
export function singleElimTemplate(n) {
  const exact = LIQUIPEDIA_BRACKET_TEMPLATES[Math.max(2, n)];
  return exact ? { name: exact, compact: true } : { name: `Bracket/${pow2(n)}`, compact: n === pow2(n) };
}

/**
 * Page keys of a double-elimination bracket matched onto a template's
 * structure (de-templates.js): from the final(s) back, each slot's feeder
 * is the match whose winner fills it, passing through the event's byes
 * (the templates have no slot for them). Null when there is no stored
 * template or the shapes differ.
 */
export function templateKeys(matches, templateName, { upper = 'wb', lower = 'lb' } = {}) {
  const stored = DOUBLE_ELIM_TEMPLATE_MATCHES[String(templateName).replace(/^Bracket\//, '')];
  if (!stored) return null;
  const nodes = parseBracketTemplate(stored.split(' ').map((p) => `{{TemplateMatch|${p}}}`).join('')).matches;
  const byId = new Map(matches.map((m) => [m.id, m]));
  const nextOf = (m) => m.next_match_id ?? m.next_key ?? null;
  const feeders = new Map();
  for (const m of matches) {
    const next = nextOf(m);
    if (next === null || !byId.has(next)) continue;
    const list = feeders.get(next) || [null, null];
    const slot = m.next_slot === 2 ? 1 : m.next_slot === 1 ? 0 : list[0] ? 1 : 0;
    list[slot] = m;
    feeders.set(next, list);
  }
  const leftOut = (m) => isBye(m) || m.slot1_void || m.slot2_void;
  const effective = (m) => {
    if (!m) return null;
    if (!leftOut(m)) return m;
    const through = (feeders.get(m.id) || []).map(effective).filter(Boolean);
    return through.length === 1 ? through[0] : null;
  };
  const keys = new Map();
  const assign = (node, m) => {
    keys.set(m.id, node.key);
    const ours = (feeders.get(m.id) || [null, null]).map(effective).filter(Boolean);
    const theirs = [node.upper, node.lower].filter(Boolean).map((k) => nodes.get(k));
    if (ours.length !== theirs.length || theirs.some((n) => !n)) throw new Error(`shape differs at ${node.key}`);
    theirs.forEach((n, i) => assign(n, ours[i]));
  };
  const fed = new Set([...nodes.values()].flatMap((n) => [n.upper, n.lower]).filter(Boolean));
  const roots = [...nodes.values()].filter((n) => !fed.has(n.key) && n.key !== 'RxMBR' && n.key !== 'RxMTP');
  const ourRoots = matches
    .filter((m) => !leftOut(m) && nextOf(m) === null && !(m.bracket === 'gf' && m.position === 2))
    .sort((a, b) => (a.bracket === lower) - (b.bracket === lower));
  try {
    if (roots.length !== ourRoots.length) throw new Error('roots differ');
    roots.forEach((n, i) => assign(n, ourRoots[i]));
  } catch {
    return null;
  }
  const reset = matches.find((m) => m.bracket === 'gf' && m.position === 2);
  if (reset && nodes.has('RxMBR')) keys.set(reset.id, 'RxMBR');
  const shown = matches.filter((m) => !leftOut(m) || keys.has(m.id));
  if (shown.length !== keys.size) return null;
  return keys;
}

/**
 * Page keys (R<column>M<n>) of an elimination bracket's matches. Columns
 * follow Liquipedia's layout: single elimination one per round; double
 * elimination puts upper round u in column 2u-2 (u > 1) and lower round l
 * in column l, the grand final after them and its reset in RxMBR. Numbers
 * run top to bottom, upper bracket first; with `compact` the byes are left
 * out (the template has no slot for them).
 */
export function bracketKeys(matches, { double = false, compact = true, upper = 'wb', lower = 'lb', template = null } = {}) {
  if (double && template) {
    const mapped = templateKeys(matches, template, { upper, lower });
    if (mapped) return mapped;
  }
  const keys = new Map();
  const columns = new Map();
  const add = (col, m) => {
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col).push(m);
  };
  if (!double) {
    const main = matches.filter((m) => m.round > 0);
    const first = Math.max(1, ...main.map((m) => m.round));
    for (const m of main) add(first - m.round + 1, m);
    const third = matches.find((m) => m.round === 0);
    if (third) keys.set(third.id, 'RxMTP');
  } else {
    const wb = matches.filter((m) => m.bracket === upper);
    const lb = matches.filter((m) => m.bracket === lower);
    const k = Math.max(1, ...wb.map((m) => m.round));
    for (const m of wb) {
      const u = k - m.round + 1;
      add(u === 1 ? 1 : 2 * u - 2, m);
    }
    const lbTop = Math.max(0, ...lb.map((m) => m.round));
    // Lower rounds: chronological l = lbTop - round + 1, in column l, but
    // aligned so the lower final shares the upper final's column.
    const upperFinalCol = k === 1 ? 1 : 2 * k - 2;
    const shift = lbTop ? upperFinalCol - lbTop : 0;
    for (const m of lb) add(lbTop - m.round + 1 + shift, m);
    for (const m of matches.filter((x) => x.bracket === 'gf')) {
      if (m.position === 2) keys.set(m.id, 'RxMBR');
      else add(upperFinalCol + 1, m);
    }
  }
  const sideOrder = (m) => (m.bracket === lower ? 1 : 0);
  for (const [col, list] of columns) {
    const shown = list
      .filter((m) => !(compact && (isBye(m) || m.slot1_void || m.slot2_void)))
      .sort((a, b) => sideOrder(a) - sideOrder(b) || a.position - b.position);
    shown.forEach((m, i) => keys.set(m.id, `R${col}M${i + 1}`));
  }
  return keys;
}

/** Event placements as SwissTableLeague / prize labels: "1;2;3-4". */
export function placementList(placements) {
  const seen = new Map();
  for (const { from, to } of placements.values()) seen.set(`${from}-${to}`, { from, to });
  return [...seen.values()]
    .sort((a, b) => a.from - b.from)
    .map(({ from, to }) => (from === to ? String(from) : `${from}-${to}`))
    .join(';');
}

/**
 * Prize pool slots: the points table's ranges, with the prize money and
 * free-text prizes of the settings on the same places (or their own rows).
 */
export function prizeSlots(pointsTable = [], prizes = [], qualifiedPlaces = []) {
  const slots = new Map();
  const slot = (place) => {
    if (!slots.has(place)) slots.set(place, { place, localprize: '', freetext: '', points: null });
    return slots.get(place);
  };
  for (const row of pointsTable || []) {
    const place = normalizePlace(row.from === row.to ? row.from : `${row.from}-${row.to}`);
    if (place) slot(place).points = row.points;
  }
  for (const p of prizes) {
    const s = slot(p.place);
    s.localprize = p.localprize;
    s.freetext = p.freetext;
  }
  const first = (place) => Number(place.split('-')[0]);
  return [...slots.values()]
    .sort((a, b) => first(a.place) - first(b.place))
    .map((s) => ({ ...s, qualified: qualifiedPlaces.includes(s.place) }));
}

/** Liquipedia name and flag of a player: their wiki page when set. */
function wikiPlayer(p) {
  const link = String(p?.link || '').trim();
  const name = link && !/^https?:/i.test(link) ? link.replace(/_/g, ' ') : p?.display_name || p?.id || '';
  const f = String(p?.flag || '').toLowerCase();
  return { name, flag: f && f !== 'xx' ? f : '' };
}

export function buildWikiPage({ t, players = [], matches = [], groupStage = null, placements = new Map(), meta, vehiclePool = '' }) {
  const warnings = [];
  const byId = new Map(players.map((p) => [p.id, wikiPlayer(p)]));
  const weekly = t.points_kind !== 'monthly';
  const { date, time } = splitTime(t.scheduled_time);
  const day = date || String(t.created_at || '').slice(0, 10);
  const twoStage = Boolean(t.playoff_format);
  const groupMatches = matches.filter((m) => ['sw', 'gse', 'gwb', 'glb'].includes(m.bracket));
  const playoffMatches = twoStage ? matches.filter((m) => !['sw', 'gse', 'gwb', 'glb'].includes(m.bracket)) : t.format === 'swiss' ? [] : matches;
  const swissMatches = matches.filter((m) => m.bracket === 'sw');
  const boGroup = meta.bestOf.group ?? inferBestOf(twoStage || t.format === 'swiss' ? groupMatches : []) ?? 1;
  const boPlayoff = meta.bestOf.playoff ?? inferBestOf(playoffMatches) ?? 1;
  const boFinal = meta.bestOf.final ?? boPlayoff;
  const out = [];
  const w = (s = '') => out.push(s);

  const opponent = (pid, score) => {
    const p = pid ? byId.get(pid) || { name: pid, flag: '' } : { name: '', flag: '' };
    return `{{SoloOpponent|p1=${p.name}${p.flag ? `|flag=${p.flag}` : ''}${score !== undefined ? `|score=${score}` : ''}}}`;
  };
  const scores = (m) => {
    if (m.status === 'walkover') return m.winner_id === m.player1_id ? ['W', 'FF'] : ['FF', 'W'];
    if (m.status === 'completed' && m.player1_id && m.player2_id) return [m.score1 ?? 0, m.score2 ?? 0];
    return [undefined, undefined];
  };
  const matchBody = (m, head, dateLine) => {
    const [s1, s2] = scores(m);
    return [
      `{{Match${head}`,
      `    |date=${dateLine}`,
      `    |opponent1=${opponent(m.player1_id, s1)}`,
      `    |opponent2=${opponent(m.player2_id, s2)}`,
      '}}',
    ].join('\n');
  };

  // ---------------------------------------------------------------- infobox
  const name = meta.name || (weekly ? 'Potato Cup Weekly #{{SUBPAGENAME}}' : t.name);
  w(`{{DISPLAYTITLE:${name}${weekly && !meta.name ? ' (土豆杯周赛#{{SUBPAGENAME}})' : ''}}}`);
  w('{{Template:Potato Cup Navbox}}');
  w();
  w('{{Infobox league');
  w(`|name=${name}`);
  w('|image=Potato_Cup_2026_lightmode.png');
  w('|icon=Potato_Cup_2026_icon_lightmode.png');
  w('|imagedark=Potato_Cup_2026_darkmode.png');
  w('|icondark=Potato_Cup_icon_darkmode.png');
  w('|series=Potato Cup');
  w('|abbreviation=');
  w(`|tickername=${meta.tickername || name}`);
  if (weekly) w('|number={{SUBPAGENAME}}');
  w('|organizer=Vermilion');
  w('|sponsor=Vermilion');
  w(`|server=${meta.server || 'Europe'}`);
  w('|type=Online');
  w('|country=World');
  w('|format=1v1');
  w(`|mode=${MODES[t.game_mode] || 'RB'}`);
  w('|vehicle=Aviation');
  if (meta.prizepool) {
    if (meta.currency === 'usd') w(`|prizepoolusd=${meta.prizepool}`);
    else w(`|prizepool=${meta.prizepool}\n|localcurrency=cny`);
  }
  w(`|player_number=${players.length}`);
  if (meta.endDate && meta.endDate !== day) w(`|sdate=${day}\n|edate=${meta.endDate}`);
  else w(`|date=${day}`);
  w(`|liquipediatier=${meta.tier || (weekly ? '4' : '3')} |${weekly ? 'liquipediatiertype' : 'tiertype'}=${meta.tiertype || (weekly ? 'Weekly' : '')}`);
  w(`|web=${meta.web}`);
  w(`|bracket=${meta.bracketUrl}`);
  if (meta.previous) w(`|previous=${meta.previous}`);
  if (meta.next) w(`|next=${meta.next}`);
  w('}}');
  w();

  // ---------------------------------------------------------------- format
  const formatName = (f) => ({ single_elim: 'Single-Elimination bracket', double_elim: 'Double-Elimination bracket', swiss: 'Swiss-Round' })[f] || f;
  const boLine = (bo) => `All matches are {{Abbr/Bo${bo}}}`;
  w('===Format===');
  w();
  if (twoStage) {
    w("* '''Group Stage:''' ");
    w(t.format === 'swiss' ? '** Swiss-Round' : `** ${t.format === 'double_elim' ? 'Double' : 'Single'}-Elimination groups`);
    w(`** ${boLine(boGroup)}`);
    if (t.advance_per_group) w(`** Top ${t.advance_per_group} of each group advance to the playoffs`);
    w();
    w("* '''Playoff Stage:'''");
    w(`** ${formatName(t.playoff_format)}`);
    w(`** ${boLine(boPlayoff)}`);
    if (boFinal !== boPlayoff) w(`** Grand Final is {{Abbr/Bo${boFinal}}}`);
  } else {
    w(`* ${formatName(t.format)}`);
    w(`* ${boLine(t.format === 'swiss' ? boGroup : boPlayoff)}`);
    if (t.format !== 'swiss' && boFinal !== boPlayoff) w(`* Grand Final is {{Abbr/Bo${boFinal}}}`);
    if (t.format === 'single_elim' && t.loser_advances) w('* 败者晋级 The loser of each match advances');
  }
  if (vehiclePool) w(`* Vehicle pool: ${vehiclePool}`);
  for (const line of meta.notes.split('\n').filter((l) => l.trim())) w(line.startsWith('*') ? line : `* ${line}`);
  w();

  // ---------------------------------------------------------------- prize pool
  const qualifiedPlaces = meta.qualifies.places ? meta.qualifies.places.split(',') : [];
  const slots = prizeSlots(t.points_table, meta.prizes, meta.qualifies.name ? qualifiedPlaces : []);
  if (slots.length) {
    const head = ['{{SoloPrizePool|localcurrency=cny'];
    if (slots.some((s) => s.freetext) && meta.freetextName) head.push(`freetext1=${meta.freetextName}`);
    w('==Prize Pool==');
    w(head.join('|'));
    if (meta.qualifies.name) w(`|qualifies1=${meta.qualifies.link || meta.qualifies.name}|qualifies1name=${meta.qualifies.name}`);
    if (t.points_table?.length && t.points_season) {
      w(`|points1=PotatoCup Leaderboard ${t.points_season}|points1link=Potato_Cup/Leaderboard/${t.points_season}`);
    }
    for (const s of slots) {
      const parts = [`place=${s.place}`];
      if (s.localprize) parts.push(`localprize=${s.localprize}`);
      if (s.qualified) parts.push('qualified1=true');
      if (s.points !== null) parts.push(`points=${s.points}`);
      if (s.freetext) parts.push(`freetext1=${s.freetext}`);
      w(`|{{Slot|${parts.join('|')}}}`);
    }
    w('}}');
    w();
  }

  // ---------------------------------------------------------------- participants
  w('==Participant==');
  w('{{ParticipantTable|count=1|');
  players.forEach((p, i) => {
    const wp = byId.get(p.id);
    w(`|p${i + 1}=${wp.name}${wp.flag ? `|p${i + 1}flag=${wp.flag}` : ''}`);
  });
  w('}}');
  w();

  // ---------------------------------------------------------------- results
  w('==Result==');
  const matchlistDate = time ? `${day} - ${time} {{Abbr/CST}}` : day;

  const swissRounds = (list, idSuffix) => {
    const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
    return rounds.map((r) => ({ round: r, matches: list.filter((m) => m.round === r).sort((a, b) => a.position - b.position), id: wikiId(t.id, `${idSuffix}${r.toString(36)}`) }));
  };

  const elimBracket = (list, { double, idSuffix, upper = 'wb', lower = 'lb', sdate = day, bo = boPlayoff, boLast = boFinal, toggle = true, template = null }) => {
    const ids = new Set();
    for (const m of list) {
      if (m.player1_id) ids.add(m.player1_id);
      if (m.player2_id) ids.add(m.player2_id);
    }
    const tpl = template || (double ? doubleElimTemplate(ids.size) : singleElimTemplate(ids.size));
    if (!tpl.compact && !template) warnings.push(`${ids.size} 人的${double ? '双败' : '单败'}对阵用了 ${tpl.name}（带轮空位），请在 Liquipedia 上确认模板。`);
    const keys = bracketKeys(list, { double, compact: tpl.compact, upper, lower, template: tpl.name });
    if (double && tpl.compact && DOUBLE_ELIM_TEMPLATE_MATCHES[tpl.name.replace(/^Bracket\//, '')] && !templateKeys(list, tpl.name, { upper, lower })) {
      warnings.push(`对阵和 ${tpl.name} 模板的结构对不上，已按列推算编号，请在 Liquipedia 上确认。`);
    }
    const finals = new Set(list.filter((m) => m.bracket === 'gf' || (!double && m.round === 1)).map((m) => m.id));
    const side = (m) => (m.bracket === 'gf' ? 2 : m.bracket === lower ? 1 : 0);
    const col = (k) => (k.startsWith('Rx') ? 999 : Number(/^R(\d+)/.exec(k)[1]));
    const ordered = [...keys.entries()]
      .map(([id, key]) => ({ m: list.find((x) => x.id === id), key }))
      .sort((a, b) => side(a.m) - side(b.m) || col(a.key) - col(b.key) || a.key.localeCompare(b.key, 'en', { numeric: true }));
    // Rounds numbered from the first one shown (byes-only rounds are left out).
    const shownRounds = (bracket) => [...new Set(ordered.filter((o) => o.m.bracket === bracket).map((o) => o.m.round))].sort((a, b) => b - a);
    const roundName = (m) => {
      if (m.bracket === 'gf') return 'Grand Final';
      if (!double && m.round === 0) return 'Third Place Match';
      const prefix = !double ? '' : m.bracket === lower ? 'Lower Bracket ' : 'Upper Bracket ';
      const named = { 1: double ? 'Final' : 'Grand Final', 2: m.bracket === lower ? 'Semifinal' : 'Semifinals', 3: 'Quarterfinals' }[m.round];
      return prefix + (named || `Round ${shownRounds(m.bracket).indexOf(m.round) + 1}`);
    };
    if (toggle) w(`{{Toggle bracket start|sdate=${sdate}|dateexact=true}}`);
    w(`{{Bracket|${tpl.name}|id=${wikiId(t.id, idSuffix)}`);
    let lastLabel = '';
    for (const { m, key } of ordered) {
      const label = roundName(m);
      if (label !== lastLabel) {
        w();
        w(`<!-- ${label} -->`);
        lastLabel = label;
      }
      w(`|${key}=${matchBody(m, `|bestof=${finals.has(m.id) ? boLast : bo}`, sdate)}`);
    }
    w('}}');
    if (toggle) w('{{Toggle bracket end}}');
  };

  if (t.format === 'swiss' && !twoStage) {
    // Single Swiss pool (weekly layout).
    const places = t.status === 'completed' ? placementList(placements) : '';
    w(`{{SwissTableLeague${places ? `|placements=${places}` : ''}`);
    w('|tournament={{FULLPAGENAME}}');
    w('|title=Swiss Round');
    w('|tiebreaker1=matchScore|tiebreaker2=gameDiff|tiebreaker3=gameWins');
    w('}}');
    w('{{box|start|padding=2em}}');
    swissRounds(swissMatches, 'r').forEach((r, i, all) => {
      w();
      w(`==={{HiddenSort|Round ${r.round}}}===`);
      w(`{{Matchlist|id=${r.id}|title=Round ${r.round}|collapsed=1`);
      r.matches.forEach((m, j) => {
        w(`|M${j + 1}=${matchBody(m, j === 0 ? `|bestof=${boGroup}|matchsection=Round ${r.round}` : '', matchlistDate)}`);
      });
      w('}}');
      w(i < all.length - 1 ? '{{Box|break|padding=1em}}' : '{{box|end}}');
    });
  } else {
    if (twoStage) {
      // Group stage: Swiss groups get a table and a match list each inside a
      // toggle box (June Europe); bracket groups one bracket each (Fall Europe).
      const swissGroups = t.format === 'swiss';
      w('==={{Stage|Group Stage}}===');
      if (swissGroups) {
        w('{{Toggle group start|state=show}}');
        w('{{Box|start|padding=2em}}');
      }
      const groups = groupStage?.groups || [];
      groups.forEach((g, gi) => {
        const n = gi + 1;
        const label = g.label || groupLabel(n);
        const own = groupMatches.filter((m) => Number(m.swiss_group || 1) === n);
        const id = wikiId(t.id, `g${label}`);
        if (swissGroups) {
          const k = Number(t.advance_per_group) || 0;
          w();
          w(`===={{HiddenSort|Group ${label}}}====`);
          w(`{{GroupTableLeague|id=${id}`);
          w(`|date=${day}`);
          w(`|title=Group ${label}|width=320px`);
          w(`|pbg1=up${k && k < g.rows.length ? `|pbg${k + 1}=down` : ''}`);
          w('}}');
          w(`{{Matchlist|id=${id}|width=320|title=Group ${label} Matches|collapsed=true`);
          let i = 0;
          for (const r of swissRounds(own, 's')) {
            r.matches.forEach((m, j) => {
              i += 1;
              w(`|M${i}=${matchBody(m, `|bestof=${boGroup}${j === 0 ? `|matchsection=Round ${r.round}` : ''}`, day)}`);
            });
          }
          w('}}');
          if (gi < groups.length - 1) w('{{Box|break|padding=2em}}');
        } else {
          const double = t.format === 'double_elim';
          const size = new Set(own.flatMap((m) => [m.player1_id, m.player2_id]).filter(Boolean)).size;
          // Unknown sizes: the next power-of-two group template, byes kept.
          const fallback = double && doubleElimGroupTemplate(pow2(size), t.advance_per_group);
          const template = double ? doubleElimGroupTemplate(size, t.advance_per_group) || (fallback && { ...fallback, compact: false }) : null;
          w();
          w(`====Group ${label}====`);
          elimBracket(own, { double, idSuffix: `g${label}`, upper: double ? 'gwb' : 'gse', lower: 'glb', bo: boGroup, boLast: boGroup, toggle: false, template });
          if (!template || !template.compact) {
            warnings.push(`Group ${label} 的${double ? '双败' : '单败'}小组对阵没有现成的 Liquipedia 模板对照，请确认模板名。`);
          }
          w('{{Box|break|padding=2em}}');
        }
      });
      if (swissGroups) {
        w('{{Box|end}}');
        w('{{Toggle group end}}');
      }
      w();
      w('==={{Stage|Playoffs}}===');
    }
    w('<section begin=Results />');
    if (playoffMatches.length) {
      elimBracket(playoffMatches, {
        double: (twoStage ? t.playoff_format : t.format) === 'double_elim',
        idSuffix: twoStage ? 'po' : 'b',
        sdate: twoStage && meta.endDate ? meta.endDate : day,
      });
    } else {
      w('<!-- 淘汰赛尚未生成 -->');
    }
    w('<section end=Results />');
  }
  w();

  // ---------------------------------------------------------------- broadcasts
  if (meta.streams || meta.talents.length) {
    w('==Broadcasts==');
    if (meta.streams) {
      w('===Streams===');
      w('{{Streams');
      for (const line of meta.streams.split('\n').filter((l) => l.trim())) w(line.startsWith('|') ? line : `|${line}`);
      w('}}');
      w();
    }
    if (meta.talents.length) {
      w('===Broadcast Talent===');
      w('{{box|start|padding=2em}}');
      meta.talents.forEach((g, i) => {
        if (i > 0 && g.lang !== meta.talents[i - 1].lang) w('{{box|break}}');
        w('{{BroadcasterCard');
        w(`|position=${g.position}${g.lang ? `|lang=${g.lang}` : ''}`);
        g.people.forEach((p, j) => w(`|b${j + 1}=${p.name}${p.flag ? `|b${j + 1}flag=${p.flag}` : ''}`));
        w('}}');
      });
      w('{{box|end}}');
      w();
    }
  }
  if (meta.vods) {
    w('===VODs===');
    for (const line of meta.vods.split('\n').filter((l) => l.trim())) w(line.startsWith('*') ? line : `* ${line}`);
    w();
  }
  w('==References==');
  w('{{Reflist}}');

  if (t.status !== 'completed') warnings.unshift('赛事还没有结束，导出的是当前进度。');
  return { text: out.join('\n'), warnings };
}
