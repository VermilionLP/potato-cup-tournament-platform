import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDoubleElimGroupPlan,
  buildSingleElimGroupPlan,
  groupBracketComplete,
  groupBracketPlacings,
  groupBracketProblem,
  groupBracketRows,
  selectBracketQualifiers,
} from '../lib/group-brackets.js';

// Plays a group bracket the way the match repository does: pending matches
// with both players get a result (lower seed number wins unless `upset`
// says otherwise), winners/losers move along the links, byes auto-advance.
function play(rows, { upset = () => false } = {}) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const seedNum = (id) => Number(String(id).replace(/\D/g, ''));
  const fill = (key, slot, id) => {
    const m = byKey.get(key);
    m[slot === 1 ? 'player1_id' : 'player2_id'] = id ?? null;
    m[slot === 1 ? 'slot1_void' : 'slot2_void'] = id == null;
    settle(m);
  };
  const propagate = (m, winner, loser) => {
    if (m.next_key) fill(m.next_key, m.next_slot, winner);
    if (m.loser_next_key) fill(m.loser_next_key, m.loser_next_slot, loser);
  };
  const settle = (m) => {
    if (m.status !== 'pending') return;
    const r1 = m.player1_id || m.slot1_void;
    const r2 = m.player2_id || m.slot2_void;
    if (!r1 || !r2) return;
    const filled = [m.player1_id, m.player2_id].filter(Boolean);
    if (filled.length === 2) return;
    m.status = 'completed';
    m.winner_id = filled[0] ?? null;
    propagate(m, m.winner_id, null);
  };
  // Byes resolved at generation already moved nobody: push them along.
  for (const m of rows) if (m.status !== 'pending') propagate(m, m.winner_id, m.player1_id && m.player2_id ? null : null);
  for (let guard = 0; guard < 500; guard += 1) {
    const m = rows.find((r) => r.status === 'pending' && r.player1_id && r.player2_id);
    if (!m) break;
    let [w, l] = seedNum(m.player1_id) < seedNum(m.player2_id) ? [m.player1_id, m.player2_id] : [m.player2_id, m.player1_id];
    if (upset(m)) [w, l] = [l, w];
    m.status = 'completed';
    m.winner_id = w;
    m.score1 = w === m.player1_id ? 2 : 1;
    m.score2 = w === m.player1_id ? 1 : 2;
    propagate(m, w, l);
  }
  return rows;
}

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const players = (n) => ids(n).map((id, i) => ({ id, seed: i + 1 }));

test('double-elimination group of 8, 2 advance: GSL-style WB + LB champions', () => {
  const plan = buildDoubleElimGroupPlan(8, 2);
  const count = (b) => plan.nodes.filter((n) => n.bracket === b).length;
  assert.equal(count('gwb'), 7);
  assert.equal(count('glb'), 6); // 2 + 2 + 1 + 1
  const rows = play(groupBracketRows('double_elim', ids(8), 2, 1));
  assert.ok(groupBracketComplete(rows));
  const placings = groupBracketPlacings('double_elim', players(8), rows, 2);
  assert.deepEqual(placings.slice(0, 2).map((p) => [p.player_id, p.how]), [['p1', '胜者组出线'], ['p2', '败者组出线']]);
  assert.equal(placings.filter((p) => p.qualified).length, 2);
});

test('double-elimination group: 4 players (GSL), 6 players with byes, 3 and 4 advancing', () => {
  for (const [n, k] of [[4, 2], [6, 2], [8, 3], [8, 4], [16, 2], [5, 2], [3, 2]]) {
    const rows = play(groupBracketRows('double_elim', ids(n), k, 1), { upset: (m) => m.bracket === 'gwb' && m.round === 1 });
    assert.ok(groupBracketComplete(rows), `${n}/${k} complete`);
    const placings = groupBracketPlacings('double_elim', players(n), rows, k);
    assert.equal(placings.filter((p) => p.qualified).length, k, `${n}/${k} qualifiers`);
    assert.equal(new Set(placings.map((p) => p.player_id)).size, n);
    // Every player plays until eliminated: nobody is knocked out twice.
    const losses = new Map();
    for (const m of rows) {
      if (!m.player1_id || !m.player2_id) continue;
      const loser = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
      losses.set(loser, (losses.get(loser) || 0) + 1);
    }
    for (const [id, c] of losses) assert.ok(c <= 2, `${id} lost ${c} times in ${n}/${k}`);
  }
});

test('single-elimination group plays everything; third place when 3+ advance', () => {
  const two = buildSingleElimGroupPlan(8);
  assert.equal(two.nodes.length, 7);
  const rows = play(groupBracketRows('single_elim', ids(8), 3, 1), { upset: (m) => m.round === 1 });
  assert.equal(rows.filter((r) => r.round === 0).length, 1);
  assert.ok(groupBracketComplete(rows));
  const placings = groupBracketPlacings('single_elim', players(8), rows, 3);
  assert.deepEqual(placings.slice(0, 4).map((p) => p.player_id), ['p2', 'p1', 'p3', 'p4']);
  assert.deepEqual(placings.slice(0, 3).map((p) => p.qualified), [true, true, true]);
  assert.equal(placings[3].qualified, false);
});

test('single-elimination group with byes and qualifiers across groups', () => {
  const a = play(groupBracketRows('single_elim', ids(5), 2, 1));
  const b = play(groupBracketRows('single_elim', ['p6', 'p7', 'p8', 'p9', 'p10'], 2, 2));
  assert.ok(groupBracketComplete(a) && groupBracketComplete(b));
  const pa = groupBracketPlacings('single_elim', players(5), a, 2);
  const pb = groupBracketPlacings('single_elim', ['p6', 'p7', 'p8', 'p9', 'p10'].map((id, i) => ({ id, seed: i + 6 })), b, 2);
  const { qualifiers } = selectBracketQualifiers([{ group: 1, label: 'A', rows: pa }, { group: 2, label: 'B', rows: pb }], 2);
  assert.deepEqual(qualifiers.map((q) => [q.player_id, q.group_rank]), [['p1', 1], ['p6', 1], ['p2', 2], ['p7', 2]]);
});

test('tie on the qualification line is reported', () => {
  // 8 players, 3 advance, no third place would tie; with 3 advancing there is
  // a third-place match, so ask for 5: two quarter-final losers tie on 2-1.
  const rows = play(groupBracketRows('single_elim', ids(8), 5, 1));
  const placings = groupBracketPlacings('single_elim', players(8), rows, 5);
  const { warnings } = selectBracketQualifiers([{ group: 1, label: 'A', rows: placings }], 5);
  assert.equal(warnings.length, 1);
});

test('start checks for elimination groups', () => {
  assert.match(groupBracketProblem('double_elim', 8, 1), /单败/);
  assert.match(groupBracketProblem('double_elim', 8, 5), /1、2、4/);
  assert.match(groupBracketProblem('double_elim', 8, 6), /1、2、4/);
  assert.equal(groupBracketProblem('double_elim', 16, 8), null);
  assert.equal(groupBracketProblem('double_elim', 8, 3), null);
  assert.equal(groupBracketProblem('double_elim', 4, 2), null);
  assert.match(groupBracketProblem('single_elim', 4, 4), /无需比赛/);
  assert.equal(groupBracketProblem('single_elim', 4, 1), null);
});
