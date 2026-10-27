// Elimination group stages: each group plays its own single- or
// double-elimination bracket, then the qualifiers go on to the playoff.
// Pure functions, no database access.
//
// Rules (agreed with the organisers):
// - Single-elimination groups play the whole bracket (with a third-place match
//   when three or more advance); the top K by final placing qualify.
// - Double-elimination groups have no grand final: the winners bracket plays
//   down to ceil(K/2) players and the losers bracket down to floor(K/2); those
//   players qualify (K = 2: winners-bracket champion + losers-bracket
//   champion, the GSL / Liquipedia "1Q-U-...-1Q" format). Both halves must be
//   powers of two (K = 2, 3, 4, 8, 16).
// - Qualifiers are ranked inside their group (single elimination: champion,
//   runner-up, 3rd, ...; double elimination: winners-bracket qualifiers first)
//   and seeded into the playoff by group rank first, like Swiss groups.
//
// Match codes: 'gse' (single-elimination group), 'gwb' / 'glb' (winners /
// losers bracket of a double-elimination group). Rounds follow the usual DB
// convention: round 1 is the last round of that bracket, higher numbers are
// earlier; the third-place match is round 0. `swiss_group` holds the group.

import { seedingOrder } from './double-elim.js';

export const GROUP_SE = 'gse';
export const GROUP_WB = 'gwb';
export const GROUP_LB = 'glb';
export const GROUP_BRACKETS = [GROUP_SE, GROUP_WB, GROUP_LB];
export const GROUP_FORMATS = ['swiss', 'single_elim', 'double_elim'];

const isPow2 = (n) => Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
const bracketSize = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/** Qualifiers taken from the winners / losers bracket of a double-elimination group. */
export function doubleElimSplit(perGroup) {
  const k = Number(perGroup) || 0;
  return { fromWinners: Math.ceil(k / 2), fromLosers: Math.floor(k / 2) };
}

// ── Plans: nodes listing where each slot comes from ─────────────────────

function makePlan() {
  const nodes = [];
  const add = (bracket, chrono, sources) => {
    const node = { bracket, chrono, sources, key: `${bracket}:c${chrono}:${nodes.filter((n) => n.bracket === bracket && n.chrono === chrono).length + 1}` };
    nodes.push(node);
    return node.key;
  };
  return { nodes, add };
}

// Chronological round index -> DB round (1 = last round of the bracket).
function numberRounds(nodes, bracket) {
  const own = nodes.filter((n) => n.bracket === bracket && n.chrono > 0);
  const last = own.reduce((max, n) => Math.max(max, n.chrono), 0);
  const positions = new Map();
  for (const n of own) {
    n.round = last - n.chrono + 1;
    const p = (positions.get(n.round) || 0) + 1;
    positions.set(n.round, p);
    n.position = p;
  }
}

/** Single-elimination group of `size` slots (power of two), optional third-place match. */
export function buildSingleElimGroupPlan(size, { thirdPlace = false } = {}) {
  if (!isPow2(size) || size < 2) throw new Error('bracket size must be a power of two');
  const { nodes, add } = makePlan();
  const order = seedingOrder(size);
  const k = Math.log2(size);
  let previous = [];
  for (let r = 1; r <= k; r += 1) {
    const current = [];
    for (let p = 0; p < size / 2 ** r; p += 1) {
      const sources = r === 1
        ? [{ type: 'seed', seed: order[p * 2] }, { type: 'seed', seed: order[p * 2 + 1] }]
        : [{ type: 'winner', key: previous[p * 2] }, { type: 'winner', key: previous[p * 2 + 1] }];
      current.push(add(GROUP_SE, r, sources));
    }
    previous = current;
  }
  numberRounds(nodes, GROUP_SE);
  if (thirdPlace && k >= 2) {
    const semis = nodes.filter((n) => n.bracket === GROUP_SE && n.round === 2);
    nodes.push({
      key: `${GROUP_SE}:third`,
      bracket: GROUP_SE,
      chrono: k,
      round: 0,
      position: 1,
      sources: semis.map((s) => ({ type: 'loser', key: s.key })),
    });
  }
  return { size, nodes };
}

/**
 * Double-elimination group of `size` slots without a grand final: the winners
 * bracket stops when `fromWinners` players are left, the losers bracket when
 * `fromLosers` are left.
 */
export function buildDoubleElimGroupPlan(size, perGroup) {
  const { fromWinners, fromLosers } = doubleElimSplit(perGroup);
  if (!isPow2(size) || size < 4) throw new Error('双败小组至少需要 4 个位置');
  if (!isPow2(fromWinners) || !isPow2(fromLosers)) {
    throw new Error('双败小组的晋级人数需让胜者组、败者组各出 1、2、4… 人（每组晋级 2、3、4、8…）');
  }
  const k = Math.log2(size);
  const wbRounds = k - Math.log2(fromWinners);
  if (wbRounds < 1) throw new Error(`每组 ${size} 个位置，胜者组最多出 ${size / 2} 人`);

  const { nodes, add } = makePlan();
  const order = seedingOrder(size);

  // Winners bracket, chronological rounds 1..wbRounds.
  const wb = [];
  for (let r = 1; r <= wbRounds; r += 1) {
    const current = [];
    for (let p = 0; p < size / 2 ** r; p += 1) {
      const sources = r === 1
        ? [{ type: 'seed', seed: order[p * 2] }, { type: 'seed', seed: order[p * 2 + 1] }]
        : [{ type: 'winner', key: wb[r - 2][p * 2] }, { type: 'winner', key: wb[r - 2][p * 2 + 1] }];
      current.push(add(GROUP_WB, r, sources));
    }
    wb.push(current);
  }

  // Losers bracket: losers of WB round 1 meet first; every later WB round's
  // losers drop in against the losers-bracket survivors (crossed so rematches
  // are delayed), with a halving round in between; after the last drop the
  // survivors keep halving until `fromLosers` are left.
  let chrono = 0;
  let survivors;
  const halve = (list) => {
    chrono += 1;
    const next = [];
    for (let p = 0; p < list.length / 2; p += 1) {
      next.push(add(GROUP_LB, chrono, [list[p * 2], list[p * 2 + 1]]));
    }
    return next.map((key) => ({ type: 'winner', key }));
  };
  survivors = halve(wb[0].map((key) => ({ type: 'loser', key })));
  for (let r = 2; r <= wbRounds; r += 1) {
    if (r > 2) survivors = halve(survivors);
    const drops = wb[r - 1].map((key) => ({ type: 'loser', key }));
    if (drops.length !== survivors.length) throw new Error('losers bracket out of balance');
    chrono += 1;
    const next = [];
    for (let p = 0; p < drops.length; p += 1) {
      next.push(add(GROUP_LB, chrono, [drops[drops.length - 1 - p], survivors[p]]));
    }
    survivors = next.map((key) => ({ type: 'winner', key }));
  }
  if (fromLosers > survivors.length) {
    throw new Error(`每组 ${size} 个位置，败者组最多出 ${survivors.length} 人`);
  }
  while (survivors.length > fromLosers) survivors = halve(survivors);

  numberRounds(nodes, GROUP_WB);
  numberRounds(nodes, GROUP_LB);
  return { size, nodes };
}

// ── Rows: players placed, byes resolved, links set ──────────────────────

/**
 * Turns a plan into match rows for players in seed order. Byes are resolved
 * like the double-elimination playoff: a match with one player is completed
 * for that player, empty slots are flagged void.
 */
export function resolvePlanRows(plan, playerIds, group = null) {
  const rows = new Map();
  for (const node of plan.nodes) {
    rows.set(node.key, {
      key: node.key,
      bracket: node.bracket,
      round: node.round,
      position: node.position,
      swiss_group: group,
      player1_id: null,
      player2_id: null,
      winner_id: null,
      loser_id: null,
      status: 'pending',
      slot1_void: false,
      slot2_void: false,
      next_key: null,
      next_slot: null,
      loser_next_key: null,
      loser_next_slot: null,
      chrono: node.chrono,
    });
  }
  const ordered = [...plan.nodes].sort((a, b) => a.chrono - b.chrono || (a.bracket === b.bracket ? 0 : a.bracket === GROUP_LB ? 1 : -1));
  for (const node of ordered) {
    const row = rows.get(node.key);
    const values = [];
    const resolved = [];
    node.sources.forEach((source, i) => {
      if (source.type === 'seed') {
        values.push(playerIds[source.seed - 1] ?? null);
        resolved.push(true);
        return;
      }
      const parent = rows.get(source.key);
      const finished = parent.status !== 'pending';
      values.push(finished ? (source.type === 'winner' ? parent.winner_id : parent.loser_id) ?? null : null);
      resolved.push(finished);
      if (source.type === 'winner') {
        parent.next_key = node.key;
        parent.next_slot = i + 1;
      } else {
        parent.loser_next_key = node.key;
        parent.loser_next_slot = i + 1;
      }
    });
    row.player1_id = values[0] ?? null;
    row.player2_id = values[1] ?? null;
    row.slot1_void = resolved[0] && !row.player1_id;
    row.slot2_void = resolved[1] && !row.player2_id;
    if (resolved.every(Boolean)) {
      const filled = [row.player1_id, row.player2_id].filter(Boolean);
      if (filled.length < 2) {
        row.status = 'completed';
        row.winner_id = filled[0] ?? null;
      }
    }
  }
  return [...rows.values()];
}

/** Rows of one group's bracket. `playerIds`: the group's players in seed order. */
export function groupBracketRows(format, playerIds, perGroup, group) {
  const size = bracketSize(playerIds.length);
  if (format === 'double_elim') {
    return resolvePlanRows(buildDoubleElimGroupPlan(Math.max(4, size), perGroup), playerIds, group);
  }
  const plan = buildSingleElimGroupPlan(size, { thirdPlace: Number(perGroup) >= 3 && size >= 4 });
  return resolvePlanRows(plan, playerIds, group);
}

/** Why a group of `size` players cannot run this format with `perGroup` qualifiers, or null. */
export function groupBracketProblem(format, size, perGroup) {
  const k = Number(perGroup) || 0;
  if (k < 1) return '请先设置每组晋级人数';
  if (k >= size) return `每组晋级 ${k} 人，但有的组只有 ${size} 人，无需比赛`;
  if (format === 'double_elim') {
    if (size < 3) return '双败小组每组至少需要 3 人';
    if (k < 2) return '双败小组每组至少晋级 2 人（胜者组、败者组各 1 人）；只晋级 1 人请用单败小组';
    try {
      buildDoubleElimGroupPlan(Math.max(4, bracketSize(size)), k);
    } catch (err) {
      return err.message;
    }
    return null;
  }
  return null;
}

// ── Results: placings and qualifiers ────────────────────────────────────

const done = (m) => m.status === 'completed' || m.status === 'walkover';
const loserOf = (m) => (m.winner_id === m.player1_id ? m.player2_id : m.player1_id);
const gameDiffFor = (m, id) => {
  if (m.status === 'walkover') return 0;
  return id === m.player1_id ? (m.score1 || 0) - (m.score2 || 0) : (m.score2 || 0) - (m.score1 || 0);
};

/** True when every match of the group bracket is decided. */
export function groupBracketComplete(matches) {
  return matches.length > 0 && matches.every((m) => done(m));
}

/**
 * Final placing of one group: [{ player_id, seed, rank, qualified, how, tie_with_next }]
 * best first. `players`: [{ id, seed }]; `matches`: that group's bracket.
 */
export function groupBracketPlacings(format, players, matches, perGroup) {
  const seedOf = new Map(players.map((p) => [p.id, p.seed ?? 9999]));
  const entries = new Map(players.map((p) => [p.id, { player_id: p.id, seed: seedOf.get(p.id), tier: 99, diff: 0, how: '' }]));
  const set = (id, tier, how, diff = 0) => {
    const e = entries.get(id);
    if (e && tier < e.tier) Object.assign(e, { tier, how, diff });
  };
  const real = (m) => done(m) && m.player1_id && m.player2_id;

  if (format === 'double_elim') {
    const wb = matches.filter((m) => m.bracket === GROUP_WB);
    const lb = matches.filter((m) => m.bracket === GROUP_LB);
    const wbLast = wb.filter((m) => m.round === 1);
    const lbLast = lb.filter((m) => m.round === 1);
    for (const m of wbLast) if (done(m) && m.winner_id) set(m.winner_id, 0, '胜者组出线');
    for (const m of lbLast) if (done(m) && m.winner_id) set(m.winner_id, 1, '败者组出线');
    // Eliminated players: the later their losers-bracket exit, the better.
    for (const m of lb) {
      if (!real(m)) continue;
      const loser = loserOf(m);
      set(loser, 1 + m.round, `败者组第 ${maxRound(lb) - m.round + 1} 轮淘汰`, gameDiffFor(m, loser));
    }
  } else {
    const se = matches.filter((m) => m.bracket === GROUP_SE);
    const final = se.find((m) => m.round === 1);
    const third = se.find((m) => m.round === 0);
    if (final && done(final) && final.winner_id) {
      set(final.winner_id, 0, '小组第 1');
      if (final.player1_id && final.player2_id) set(loserOf(final), 1, '小组第 2', gameDiffFor(final, loserOf(final)));
    }
    if (third && real(third)) {
      set(third.winner_id, 2, '季军赛胜');
      set(loserOf(third), 3, '季军赛负', gameDiffFor(third, loserOf(third)));
    }
    const top = maxRound(se);
    for (const m of se) {
      if (m.round < 2 || !real(m)) continue;
      const loser = loserOf(m);
      set(loser, 2 + 2 * m.round, `第 ${top - m.round + 1} 轮淘汰`, gameDiffFor(m, loser));
    }
  }

  const sorted = [...entries.values()].sort((a, b) => a.tier - b.tier || b.diff - a.diff || a.seed - b.seed);
  const k = Number(perGroup) || 0;
  return sorted.map((e, i) => {
    const next = sorted[i + 1];
    return {
      player_id: e.player_id,
      seed: e.seed,
      rank: i + 1,
      qualified: i < k && e.tier < 99,
      how: e.how,
      // Same stage and game differential as the next player: only the seed separates them.
      tie_with_next: Boolean(next && next.tier === e.tier && next.diff === e.diff && e.tier < 99),
    };
  });
}

function maxRound(list) {
  return list.reduce((max, m) => Math.max(max, m.round), 0);
}

/**
 * Qualifiers of all groups ordered for playoff seeding (group rank first, then
 * registration seed), plus warnings for a qualification line decided by seed.
 * `placings`: [{ group, label, rows }] from groupBracketPlacings.
 */
export function selectBracketQualifiers(placings, perGroup) {
  const qualifiers = [];
  const warnings = [];
  for (const { group, label, rows } of placings) {
    // Only places already decided (a group still playing lists fewer).
    rows.slice(0, perGroup).filter((row) => row.qualified).forEach((row) => {
      qualifiers.push({ ...row, group, group_label: label, group_rank: row.rank });
    });
    const lastIn = rows[perGroup - 1];
    if (lastIn?.qualified && lastIn.tie_with_next) {
      warnings.push({
        group,
        player_in: lastIn.player_id,
        player_out: rows[perGroup].player_id,
        message: `${label} 组第 ${perGroup} 名与第 ${perGroup + 1} 名在同一轮出局、小分相同，按报名种子决定晋级`,
      });
    }
  }
  qualifiers.sort((a, b) => a.group_rank - b.group_rank || a.seed - b.seed);
  return { qualifiers, warnings };
}
