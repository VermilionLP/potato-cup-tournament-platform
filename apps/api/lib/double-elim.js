// Double-elimination bracket planning.
//
// Round numbers follow the existing DB convention: round 1 is the final of a
// bracket, the highest round is its first round. Winners bracket, losers
// bracket and the grand final are numbered independently and told apart by the
// `bracket` column.
//
// `resolveDoubleElimRows` also resolves byes: a match whose only possible
// opponent can never arrive is completed as a walkover, and that emptiness is
// propagated as a `slot*_void` flag so later results can auto-advance.

/** Seed order for a single-elimination bracket of `size` slots. */
export function seedingOrder(size) {
  if (size <= 2) return [1, 2];
  const half = seedingOrder(size / 2);
  const result = [];
  for (let i = 0; i < half.length; i += 1) {
    result.push(half[i]);
    result.push(size + 1 - half[i]);
  }
  return result;
}

/**
 * Structural plan for a bracket of `size` slots (power of two, >= 4).
 * Every node lists where each of its two slots comes from: a seed number, the
 * winner of another match, or the loser of another match.
 */
export function buildDoubleElimPlan(size) {
  if (!Number.isInteger(size) || size < 4 || (size & (size - 1)) !== 0) {
    throw new Error('Double elimination needs a power-of-two bracket of at least 4');
  }
  const k = Math.log2(size);
  const order = seedingOrder(size);
  const nodes = [];
  const wbRoundDb = (chrono) => k - chrono + 1;
  const lbRoundDb = (chrono) => 2 * k - 2 - chrono + 1;

  const add = (bracket, round, position, sources) => {
    nodes.push({
      key: `${bracket}:${round}:${position}`,
      bracket,
      round,
      position,
      sources,
      stage: 0,
    });
  };

  // Winners bracket.
  for (let r = 1; r <= k; r += 1) {
    const count = size / 2 ** r;
    for (let p = 1; p <= count; p += 1) {
      const sources =
        r === 1
          ? [
              { type: 'seed', seed: order[(p - 1) * 2] },
              { type: 'seed', seed: order[(p - 1) * 2 + 1] },
            ]
          : [
              {
                type: 'winner',
                key: `wb:${wbRoundDb(r - 1)}:${(p - 1) * 2 + 1}`,
              },
              {
                type: 'winner',
                key: `wb:${wbRoundDb(r - 1)}:${(p - 1) * 2 + 2}`,
              },
            ];
      add('wb', wbRoundDb(r), p, sources);
    }
  }

  // Losers bracket.
  for (let L = 1; L <= 2 * k - 2; L += 1) {
    const count = size / 2 ** (Math.floor((L + 1) / 2) + 1);
    for (let p = 1; p <= count; p += 1) {
      let sources;
      if (L === 1) {
        sources = [
          { type: 'loser', key: `wb:${wbRoundDb(1)}:${(p - 1) * 2 + 1}` },
          { type: 'loser', key: `wb:${wbRoundDb(1)}:${(p - 1) * 2 + 2}` },
        ];
      } else if (L % 2 === 1) {
        sources = [
          { type: 'winner', key: `lb:${lbRoundDb(L - 1)}:${(p - 1) * 2 + 1}` },
          { type: 'winner', key: `lb:${lbRoundDb(L - 1)}:${(p - 1) * 2 + 2}` },
        ];
      } else {
        // A winners-bracket round feeds this round, crossed so the two players
        // do not meet again immediately.
        const wbChrono = L / 2 + 1;
        const wbCount = size / 2 ** wbChrono;
        sources = [
          {
            type: 'loser',
            key: `wb:${wbRoundDb(wbChrono)}:${wbCount - p + 1}`,
          },
          { type: 'winner', key: `lb:${lbRoundDb(L - 1)}:${p}` },
        ];
      }
      add('lb', lbRoundDb(L), p, sources);
    }
  }

  // Grand final: winners-bracket champion vs losers-bracket champion.
  add('gf', 1, 1, [
    { type: 'winner', key: `wb:${wbRoundDb(k)}:1` },
    { type: 'winner', key: `lb:${lbRoundDb(2 * k - 2)}:1` },
  ]);

  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const stageOf = (node) => {
    if (node.stage) return node.stage;
    let stage = 0;
    for (const source of node.sources) {
      if (source.type === 'seed') continue;
      stage = Math.max(stage, stageOf(byKey.get(source.key)));
    }
    node.stage = stage + 1;
    return node.stage;
  };
  nodes.forEach(stageOf);

  return { size, k, wbRounds: k, lbRounds: 2 * k - 2, nodes, byKey };
}

/**
 * Rows ready to insert for a given seed-ordered player list. Byes are already
 * resolved: a match with exactly one player is `completed`, a match that can
 * never be played is `completed` with no winner, and empty slots are flagged.
 */
export function resolveDoubleElimRows(playerIds) {
  const players = Array.isArray(playerIds) ? playerIds : [];
  if (players.length < 4) {
    throw new Error('Need at least 4 players for double elimination');
  }
  const k = Math.ceil(Math.log2(players.length));
  const size = 2 ** k;
  const plan = buildDoubleElimPlan(size);

  const rows = new Map();
  for (const node of plan.nodes) {
    rows.set(node.key, {
      key: node.key,
      bracket: node.bracket,
      round: node.round,
      position: node.position,
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
      stage: node.stage,
    });
  }

  const ordered = [...plan.nodes].sort(
    (a, b) => a.stage - b.stage || a.bracket.localeCompare(b.bracket),
  );

  for (const node of ordered) {
    const row = rows.get(node.key);
    const values = [];
    const resolved = [];

    for (const source of node.sources) {
      if (source.type === 'seed') {
        values.push(players[source.seed - 1] ?? null);
        resolved.push(true);
        continue;
      }
      const parent = rows.get(source.key);
      const finished =
        parent.status === 'completed' || parent.status === 'walkover';
      const value = finished
        ? source.type === 'winner'
          ? parent.winner_id
          : parent.loser_id
        : null;
      values.push(value ?? null);
      resolved.push(finished);

      if (source.type === 'winner') {
        parent.next_key = node.key;
        parent.next_slot = values.length;
      } else {
        parent.loser_next_key = node.key;
        parent.loser_next_slot = values.length;
      }
    }

    row.player1_id = values[0] ?? null;
    row.player2_id = values[1] ?? null;
    row.slot1_void = resolved[0] && !row.player1_id;
    row.slot2_void = resolved[1] && !row.player2_id;

    if (resolved.every(Boolean)) {
      const filled = [row.player1_id, row.player2_id].filter(Boolean);
      if (filled.length === 2) {
        row.status = 'pending';
      } else {
        row.status = 'completed';
        row.winner_id = filled[0] ?? null;
        row.loser_id = null;
      }
    }
  }

  return [...rows.values()];
}
