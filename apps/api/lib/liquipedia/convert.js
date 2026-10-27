// Turns a parsed Liquipedia page into platform tournaments (rows for
// tournaments, tournament_players and matches). Pure: no database access.
//
// Mapping
// - One bracket, nothing else          -> single_elim / double_elim tournament
// - Swiss table or plain match lists   -> swiss tournament (single stage)
// - Group tables / Swiss + one bracket -> two-stage (swiss groups + playoff)
// - Several brackets                   -> one tournament per bracket, plus the
//                                         group stage on its own if present
// - Hub pages without results, team (2v2) events, leaderboards -> skipped
//
// Bracket links follow the Liquipedia template: a match's winner moves to
// the match that lists it as toupper (slot 1) / tolower (slot 2). Where a
// lower-bracket slot has no feeder, the player there dropped from the
// winners bracket; that drop is found from the actual results.

import { isDoubleElimination } from './bracket-template.js';
import { normalizeCountry } from './countries.js';
import { matchResult, parseBlocks, parseInfobox } from './page.js';

const SKIP_TITLES = [/\/Leaderboard\//i, /\/Simulate\//i, /^Potato Cup Misc$/i];

/** Liquipedia flag value -> ISO code used by apps/web/static/flags, or null. */
export function normalizeFlag(value) {
  return normalizeCountry(value);
}

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const STATUS_BY_KIND = { played: 'completed', walkover: 'walkover', bye: 'completed' };

function rowFromResult(result, extra) {
  const winnerId = result.winner === 1 ? result.p1 : result.winner === 2 ? result.p2 : null;
  return {
    player1_id: result.p1,
    player2_id: result.p2,
    score1: result.kind === 'played' ? result.s1 : 0,
    score2: result.kind === 'played' ? result.s2 : 0,
    winner_id: winnerId,
    status: STATUS_BY_KIND[result.kind] || 'pending',
    ...extra,
  };
}

function roundNumber(text) {
  const m = /(?:round|第)\s*(\d+)/i.exec(String(text || '')) || /^\s*R?(\d+)\s*$/i.exec(String(text || ''));
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------- Swiss / groups

/**
 * Group-stage matches -> rows with bracket 'sw'. `groups`: [{ group, label,
 * players, lists: [matchlist block] }]; group = null for a single stage.
 */
function swissRows(groups, warnings) {
  const rows = [];
  const positions = new Map();
  let maxRound = 0;
  for (const g of groups) {
    const entries = [];
    for (const list of g.lists) {
      let carry = roundNumber(list.title);
      for (const m of list.matches) {
        carry = roundNumber(m.header) ?? roundNumber(m.match.section) ?? carry;
        entries.push({ round: carry, result: matchResult(m.match) });
      }
    }
    // Lists without round labels: a new round starts when a player repeats.
    if (entries.some((e) => e.round === null)) {
      let round = 1;
      let busy = new Set();
      for (const e of entries) {
        const ids = [e.result.p1, e.result.p2].filter(Boolean);
        if (ids.some((id) => busy.has(id))) {
          round += 1;
          busy = new Set();
        }
        ids.forEach((id) => busy.add(id));
        e.round = round;
      }
    }
    for (const e of entries) {
      if (e.result.kind === 'unplayed' || e.result.kind === 'team') continue;
      const pos = (positions.get(e.round) || 0) + 1;
      positions.set(e.round, pos);
      maxRound = Math.max(maxRound, e.round);
      rows.push(rowFromResult(e.result, { bracket: 'sw', round: e.round, position: pos, swiss_group: g.group }));
    }
    if (!entries.length) warnings.push(`${g.label || '瑞士轮'}没有比赛记录`);
  }
  return { rows, rounds: maxRound };
}

// ---------------------------------------------------------------- brackets

function swapResult(r) {
  return { ...r, p1: r.p2, p2: r.p1, s1: r.s2, s2: r.s1, winner: r.winner === 1 ? 2 : r.winner === 2 ? 1 : r.winner };
}

function winnerName(r) {
  if (!r || !['played', 'walkover', 'bye'].includes(r.kind)) return null;
  return r.winner === 1 ? r.p1 : r.winner === 2 ? r.p2 : null;
}

/**
 * Results keyed by template match, with each match's opponents put in the
 * slot their feeder match fills (editors sometimes list them the other way
 * round). Reports a feeder winner that does not appear in the next match.
 */
function orientedResults(block, template, warnings) {
  const results = new Map();
  for (const n of orderedNodes(template)) {
    let r = matchResult(block.matches[n.key]);
    const w1 = n.upper ? winnerName(results.get(n.upper)) : null;
    const w2 = n.lower ? winnerName(results.get(n.lower)) : null;
    if ((w1 && r.p2 === w1 && r.p1 !== w1) || (w2 && r.p1 === w2 && r.p2 !== w2)) r = swapResult(r);
    for (const [feeder, w, slotPlayer] of [[n.upper, w1, r.p1], [n.lower, w2, r.p2]]) {
      if (w && r.kind !== 'unplayed' && slotPlayer !== w && r.p1 !== w && r.p2 !== w) {
        warnings.push(`${n.key}：上一场 ${feeder} 的胜者 ${w} 没有出现在这一场（页面数据前后不一致）`);
      }
    }
    results.set(n.key, r);
  }
  for (const n of template.matches.values()) {
    if (!results.has(n.key)) results.set(n.key, matchResult(block.matches[n.key]));
  }
  return results;
}

function orderedNodes(template) {
  return [...template.matches.values()]
    .filter((n) => n.R !== null)
    .sort((a, b) => a.R - b.R || a.M - b.M);
}

function singleElimRows(block, template, warnings) {
  const results = orientedResults(block, template, warnings);
  const nodes = orderedNodes(template).filter((n) => n.side !== 'tp');
  const roots = nodes.filter((n) => !n.parent);
  if (roots.length > 1) warnings.push(`对阵 ${block.template} 有 ${roots.length} 个终点（资格赛对阵），按并列决赛处理`);

  const placed = new Map(); // key -> { round, position }
  let maxDepth = 1;
  const place = (key, round, position) => {
    placed.set(key, { round, position });
    maxDepth = Math.max(maxDepth, round);
    const n = template.matches.get(key);
    if (n.upper) place(n.upper, round + 1, position * 2 - 1);
    if (n.lower) place(n.lower, round + 1, position * 2);
  };
  roots.forEach((r, i) => place(r.key, 1, i + 1));

  const rows = [];
  for (const n of nodes) {
    const at = placed.get(n.key);
    const result = results.get(n.key);
    if (result.kind === 'team') return null;
    rows.push(rowFromResult(result, { key: n.key, bracket: 'main', round: at.round, position: at.position }));
    // A player entering this match directly (no feeder) gets a bye chain so the
    // bracket keeps the full-tree shape the platform renders.
    for (const [slot, feeder] of [[1, n.upper], [2, n.lower]]) {
      const player = slot === 1 ? result.p1 : result.p2;
      if (feeder || !player || at.round >= maxDepth) continue;
      let pos = at.position * 2 - (slot === 1 ? 1 : 0);
      for (let r = at.round + 1; r <= maxDepth; r += 1) {
        rows.push({
          key: `bye:${n.key}:${slot}:${r}`, bracket: 'main', round: r, position: pos,
          player1_id: player, player2_id: null, score1: 0, score2: 0, winner_id: player, status: 'completed',
        });
        pos = pos * 2 - 1;
      }
    }
  }
  // A bye chain only exists where the template has no match, so (round, position) stays unique.
  const third = template.matches.get('RxMTP');
  if (third) {
    const result = matchResult(block.matches.RxMTP);
    if (result.p1 || result.p2) rows.push(rowFromResult(result, { key: 'RxMTP', bracket: 'main', round: 0, position: 1 }));
  }
  return rows;
}

function doubleElimRows(block, template, warnings) {
  const results = orientedResults(block, template, warnings);
  const nodes = orderedNodes(template);
  const byKey = template.matches;

  // Grand final: a match fed by both an upper and a lower match.
  const isGrandFinal = (n) =>
    n.upper && n.lower && byKey.get(n.upper)?.side === 'u' && byKey.get(n.lower)?.side === 'l';
  const gf = nodes.find((n) => !n.parent && isGrandFinal(n)) || null;
  const bracketOf = (n) => (n === gf ? 'gf' : n.side === 'l' ? 'lb' : 'wb');

  // Round = distance to the last match of the same bracket (1 = its final).
  const roundOf = new Map();
  for (const n of nodes) {
    if (n === gf) continue;
    let depth = 1;
    let cur = n;
    while (cur.parent && byKey.get(cur.parent.key) !== gf && bracketOf(byKey.get(cur.parent.key)) === bracketOf(n)) {
      cur = byKey.get(cur.parent.key);
      depth += 1;
    }
    roundOf.set(n.key, depth);
  }

  const rows = [];
  const positions = new Map();
  for (const n of nodes) {
    const result = results.get(n.key);
    if (result.kind === 'team') return null;
    const bracket = bracketOf(n);
    const round = bracket === 'gf' ? 1 : roundOf.get(n.key);
    const slotKey = `${bracket}:${round}`;
    const position = (positions.get(slotKey) || 0) + 1;
    positions.set(slotKey, position);
    const parent = n.parent && byKey.get(n.parent.key);
    rows.push(rowFromResult(result, {
      key: n.key,
      bracket,
      round,
      position,
      next_key: parent ? parent.key : null,
      next_slot: parent ? n.parent.slot : null,
      loser_next_key: null,
      loser_next_slot: null,
      slot1_void: !n.upper && !result.p1,
      slot2_void: !n.lower && !result.p2,
    }));
  }

  // Bracket reset.
  if (gf?.reset) {
    const reset = matchResult(block.matches[gf.reset]);
    if (reset.p1 && reset.p2) {
      rows.push(rowFromResult(reset, { key: gf.reset, bracket: 'gf', round: 1, position: 2 }));
    }
  }

  // Drops: a lower-bracket slot without a feeder holds a winners-bracket loser.
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  const loserOf = (row) => (row.winner_id === row.player1_id ? row.player2_id : row.player1_id);
  const wbRows = rows.filter((r) => r.bracket === 'wb' && r.winner_id && r.player1_id && r.player2_id);
  for (const n of nodes) {
    if (n.side !== 'l') continue;
    const row = rowByKey.get(n.key);
    for (const [slot, feeder] of [[1, n.upper], [2, n.lower]]) {
      const player = slot === 1 ? row.player1_id : row.player2_id;
      if (feeder || !player) continue;
      const source = wbRows.find((w) => !w.loser_next_key && loserOf(w) === player);
      if (source) {
        source.loser_next_key = n.key;
        source.loser_next_slot = slot;
      } else {
        warnings.push(`${n.key} 的 ${player} 找不到来自胜者组的掉落场次`);
      }
    }
  }
  return { rows, hasGrandFinal: Boolean(gf), reset: rows.some((r) => r.key === gf?.reset) };
}

function bracketStage(block, templates, warnings) {
  const template = templates.get(block.template);
  if (!template) {
    warnings.push(`缺少对阵模板 ${block.template}`);
    return null;
  }
  if (isDoubleElimination(template)) {
    const out = doubleElimRows(block, template, warnings);
    if (!out) return null;
    if (!out.hasGrandFinal) warnings.push(`双败对阵 ${block.template} 没有总决赛（资格赛对阵）`);
    return { format: 'double_elim', rows: out.rows, reset: out.reset };
  }
  const rows = singleElimRows(block, template, warnings);
  return rows ? { format: 'single_elim', rows, reset: false, thirdPlace: rows.some((r) => r.round === 0) } : null;
}

// Group brackets: a group stage played as one bracket per group whose
// template ends in qualifier slots ("Bracket/8-1Q-U-4L2DSL1D-1Q",
// "Bracket/2L1D-1Q-U-2-1Q", "Bracket/16-1Q"). The roots of such a bracket
// are its qualifying spots.
export function isQualifierTemplate(name) {
  return /\d+Q(?:$|-)/.test(String(name || '').replace(/^Bracket\//i, ''));
}

/**
 * One group's bracket as platform group rows ('gwb' / 'glb' for double
 * elimination, 'gse' for single elimination), keys prefixed with the group
 * so several groups can share one event. Returns { format, rows, qualifiers }.
 */
function groupBracketStage(block, templates, group, warnings) {
  const template = templates.get(block.template);
  if (!template) {
    warnings.push(`缺少对阵模板 ${block.template}`);
    return null;
  }
  const roots = [...template.matches.values()].filter((n) => n.R !== null && !n.parent && n.side !== 'tp').length;
  const prefix = (key) => (key ? `g${group}:${key}` : key);
  const relabel = (row, bracket) => ({
    ...row,
    key: prefix(row.key),
    bracket,
    swiss_group: group,
    next_key: prefix(row.next_key ?? null),
    loser_next_key: prefix(row.loser_next_key ?? null),
  });
  if (isDoubleElimination(template)) {
    const out = doubleElimRows(block, template, warnings);
    if (!out) return null;
    return {
      format: 'double_elim',
      qualifiers: roots,
      rows: out.rows.map((r) => relabel(r, r.bracket === 'lb' ? 'glb' : 'gwb')),
    };
  }
  const rows = singleElimRows(block, template, []);
  if (!rows) return null;
  // Single-elimination group rows carry explicit winner links (the group
  // views follow them); bye stubs stay unlinked.
  for (const r of rows) {
    const node = template.matches.get(r.key);
    if (node?.parent) {
      r.next_key = node.parent.key;
      r.next_slot = node.parent.slot;
    }
  }
  return { format: 'single_elim', qualifiers: roots, rows: rows.map((r) => relabel(r, 'gse')) };
}

// ---------------------------------------------------------------- page

function groupStages(blocks) {
  // A group table owns the match lists that follow it (until the next table
  // or bracket). Match lists without a table form one Swiss stage.
  const groups = [];
  let current = null;
  let loose = null;
  for (const b of blocks) {
    if (b.kind === 'group') {
      current = { label: b.title || `Group ${groups.length + 1}`, players: b.players, lists: [] };
      groups.push(current);
    } else if (b.kind === 'matchlist') {
      if (current) current.lists.push(b);
      else {
        if (!loose) loose = { label: '', players: [], lists: [] };
        loose.lists.push(b);
      }
    } else if (b.kind === 'bracket') {
      current = null;
    }
  }
  if (loose) groups.unshift(loose);
  return groups.filter((g) => g.lists.length);
}

function datePart(value) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
  return m ? m[1] : null;
}

/**
 * Converts one page. `templates`: Map of "Bracket/<id>" -> parsed template.
 * Returns { title, skipped, events, warnings }.
 */
export function convertPage({ title, wikitext, templates = new Map(), today = new Date() }) {
  const warnings = [];
  const skip = (reason) => ({ title, skipped: reason, events: [], warnings });
  if (!wikitext || /^\s*#REDIRECT/i.test(wikitext)) return skip('空页面或重定向');
  if (SKIP_TITLES.some((re) => re.test(`${title}/`) || re.test(title))) return skip('排行榜/杂项/模拟赛');
  const info = parseInfobox(wikitext, title);
  if (!info) return skip('没有赛事信息框');
  const blocks = parseBlocks(wikitext, title);
  const brackets = blocks.filter((b) => b.kind === 'bracket');
  const groups = groupStages(blocks);
  if (!brackets.length && !groups.length) return skip('没有比赛结果（总览页）');

  const firstMatchDate = blocks
    .flatMap((b) => (b.kind === 'bracket' ? Object.values(b.matches) : b.kind === 'matchlist' ? b.matches.map((m) => m.match) : []))
    .map((m) => datePart(m?.date))
    .filter(Boolean)
    .sort()[0];
  const date = datePart(info.date) || firstMatchDate || null;
  if (!date) warnings.push('没有找到比赛日期');
  const todayIso = today.toISOString().slice(0, 10);
  if (date && datePart(info.sdate || info.date) > todayIso) return skip(`尚未开始（${datePart(info.sdate || info.date)}）`);

  const mode = /^(ab|rb|sb)$/i.test(info.mode) ? info.mode.toLowerCase() : 'rb';
  const vehiclePool = /legacy jet/i.test(`${title} ${wikitext.slice(0, 3000)}`)
    ? 'legacy-jet'
    : /prop/i.test(title) ? 'prop' : 'proleague';

  const baseId = `lp-${slugify(title.replace(/^Potato Cup/i, 'pc'))}`;
  const events = [];
  const flags = new Map();
  for (const b of blocks) {
    const opponents = b.kind === 'bracket' ? Object.values(b.matches) : b.kind === 'matchlist' ? b.matches.map((m) => m.match) : [];
    for (const m of opponents) {
      for (const o of [m?.opponent1, m?.opponent2]) {
        if (o?.name && o.flag && !flags.has(o.name)) flags.set(o.name, normalizeFlag(o.flag));
      }
    }
  }

  const makeEvent = (suffix, parts) => {
    const playerOrder = [];
    const groupOf = new Map();
    for (const g of parts.groups || []) for (const p of g.players || []) groupOf.set(p, g.group);
    for (const r of parts.rows) {
      for (const id of [r.player1_id, r.player2_id]) {
        if (id && !playerOrder.includes(id)) playerOrder.push(id);
        if (id && r.bracket === 'sw' && r.swiss_group && !groupOf.has(id)) groupOf.set(id, r.swiss_group);
      }
    }
    const decided = parts.rows.filter((r) => r.player1_id && r.player2_id && r.winner_id);
    if (!decided.length) {
      warnings.push(`${suffix || title} 没有打完的比赛，已跳过`);
      return;
    }
    events.push({
      id: suffix ? `${baseId}-${slugify(suffix) || events.length + 1}` : baseId,
      name: suffix ? `${info.name} - ${suffix}` : info.name,
      date,
      mode,
      vehiclePool,
      sourceTitle: title,
      format: parts.format,
      playoffFormat: parts.playoffFormat || null,
      swissRounds: parts.swissRounds || null,
      swissGroupSize: parts.swissGroupSize || null,
      advancePerGroup: parts.advancePerGroup || null,
      currentStage: parts.playoffFormat ? 'playoff' : 'group',
      grandFinalReset: Boolean(parts.reset),
      holdThirdPlace: Boolean(parts.thirdPlace),
      players: playerOrder.map((id, i) => ({
        id,
        flag: flags.get(id) || null,
        seed: i + 1,
        swiss_group: groupOf.get(id) ?? null,
      })),
      matches: parts.rows,
    });
  };

  const groupStage = () => {
    const numbered = groups.map((g, i) => ({ ...g, group: groups.length > 1 || brackets.length ? i + 1 : null }));
    const { rows, rounds } = swissRows(numbered, warnings);
    return { rows, rounds, groups: numbered };
  };

  const groupBrackets = brackets.filter((b) => isQualifierTemplate(b.template));
  const playoffBrackets = brackets.filter((b) => !isQualifierTemplate(b.template));
  if (groupBrackets.length >= 2 && playoffBrackets.length === 1) {
    // Group stage of brackets (one per group) + one playoff bracket.
    const stages = groupBrackets.map((b, i) => groupBracketStage(b, templates, i + 1, warnings));
    const playoff = bracketStage(playoffBrackets[0], templates, warnings);
    if (!playoff || stages.some((st) => !st)) return { title, skipped: '对阵无法转换', events: [], warnings };
    const formats = new Set(stages.map((st) => st.format));
    if (formats.size > 1) warnings.push('各小组的对阵赛制不一致，按第一组处理');
    const rows = stages.flatMap((st) => st.rows);
    const groupsOut = stages.map((st, i) => ({
      group: i + 1,
      players: [...new Set(st.rows.flatMap((r) => [r.player1_id, r.player2_id]).filter(Boolean))],
    }));
    makeEvent(null, {
      format: stages[0].format,
      playoffFormat: playoff.format,
      rows: [...rows, ...playoff.rows],
      groups: groupsOut,
      swissGroupSize: Math.max(...groupsOut.map((g) => g.players.length)),
      advancePerGroup: Math.max(...stages.map((st) => st.qualifiers)),
      reset: playoff.reset,
      thirdPlace: playoff.thirdPlace,
    });
  } else if (brackets.length === 1 && groups.length) {
    const gs = groupStage();
    const playoff = bracketStage(brackets[0], templates, warnings);
    if (!playoff) return { title, skipped: '对阵无法转换', events: [], warnings };
    const sizes = gs.groups.map((g) => new Set(gs.rows.filter((r) => r.swiss_group === g.group).flatMap((r) => [r.player1_id, r.player2_id]).filter(Boolean)).size);
    const playoffPlayers = new Set(playoff.rows.flatMap((r) => [r.player1_id, r.player2_id]).filter(Boolean)).size;
    makeEvent(null, {
      format: 'swiss',
      playoffFormat: playoff.format,
      rows: [...gs.rows, ...playoff.rows],
      groups: gs.groups,
      swissRounds: gs.rounds,
      swissGroupSize: gs.groups.length > 1 ? Math.max(...sizes) : null,
      advancePerGroup: Math.max(1, Math.round(playoffPlayers / gs.groups.length)),
      reset: playoff.reset,
    });
  } else {
    if (groups.length) {
      if (groups.length > 1 && !brackets.length) {
        for (const [i, g] of groups.entries()) {
          const { rows, rounds } = swissRows([{ ...g, group: null }], warnings);
          makeEvent(g.label || `Group ${i + 1}`, { format: 'swiss', rows, swissRounds: rounds });
        }
      } else {
        const gs = groupStage();
        makeEvent(brackets.length ? '小组赛' : null, {
          format: 'swiss',
          rows: gs.rows.map((r) => ({ ...r, swiss_group: null })),
          swissRounds: gs.rounds,
        });
      }
    }
    brackets.forEach((b, i) => {
      const stage = bracketStage(b, templates, warnings);
      if (!stage) return;
      const suffix = brackets.length > 1 || groups.length ? b.title || (i === brackets.length - 1 ? '淘汰赛' : `对阵 ${i + 1}`) : null;
      makeEvent(suffix, { format: stage.format, rows: stage.rows, reset: stage.reset, thirdPlace: stage.thirdPlace });
    });
  }

  // Ids must be unique within the page.
  const seen = new Map();
  for (const e of events) {
    const n = (seen.get(e.id) || 0) + 1;
    seen.set(e.id, n);
    if (n > 1) e.id = `${e.id}-${n}`;
  }
  if (!events.length) return { title, skipped: '没有打完的比赛', events, warnings };
  return { title, skipped: null, events, warnings };
}

// Cyrillic letters that look like Latin ones, as seen in a few player names.
const HOMOGLYPHS = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', м: 'm', т: 't', в: 'b', н: 'h', і: 'i' };

/** Key under which spellings of the same name collide (case, _, homoglyphs). */
export function nameKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[аеорсухкмтвні]/g, (c) => HOMOGLYPHS[c])
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-.]+/g, '');
}

/** Groups of different spellings that probably belong to one player. */
export function similarNames(names) {
  const groups = new Map();
  for (const n of new Set(names)) {
    const key = nameKey(n);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(n);
  }
  return [...groups.values()].filter((g) => g.size > 1).map((g) => [...g].sort());
}
