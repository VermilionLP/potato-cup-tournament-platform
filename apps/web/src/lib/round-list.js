// Phone view of an elimination bracket (BracketRoundList): one tab per
// round (per bracket and round in double elimination), in playing order,
// and the round to open first. Pure.

const decided = (m) => m.status === "completed" || m.status === "walkover";
// A bye: decided with only one player; it is not a match to show.
const isBye = (m) => decided(m) && (!m.player1_id || !m.player2_id);

/**
 * Tabs [{ key, label, matches, done, total }] from the bracket's matches,
 * ordered by when they are played (`order`: match id -> number).
 */
export function roundTabs(matches = [], roundLabel = () => "", order = new Map()) {
  const groups = new Map();
  for (const m of matches) {
    if (isBye(m)) continue;
    // The third-place match goes with the final.
    const key = m.round === 0 && (!m.bracket || m.bracket === "main") ? "main:1" : `${m.bracket || "main"}:${m.round}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const rank = (m) => order.get(m.id) ?? 1e9 + m.id;
  const totals = {
    wb: Math.max(0, ...matches.filter((m) => m.bracket === "wb").map((m) => m.round)),
    lb: Math.max(0, ...matches.filter((m) => m.bracket === "lb").map((m) => m.round)),
  };
  return [...groups.entries()]
    .map(([key, ms]) => {
      const sorted = [...ms].sort((a, b) => (a.round === 0) - (b.round === 0) || rank(a) - rank(b));
      const label = roundLabel(sorted.find((m) => m.round !== 0) || sorted[0]);
      return { key, label, matches: sorted, done: sorted.filter(decided).length, total: sorted.length, first: Math.min(...sorted.map(rank)) };
    })
    .map((tab) => ({ ...tab, at: playingPosition(tab, totals) ?? tab.first }))
    .sort((a, b) => a.at - b.at || a.first - b.first)
    .map(({ first, at, ...tab }) => tab);
}

/**
 * Double elimination, in the order rounds are played: winners round 1,
 * losers round 1, winners round 2, losers rounds 2 and 3, ... grand final.
 * Rounds count down to each bracket's final (round 1). Null elsewhere.
 */
function playingPosition(tab, totals) {
  const [bracket, r] = tab.key.split(":");
  const round = Number(r);
  if (bracket === "wb") return totals.wb - round;
  if (bracket === "lb") {
    const j = totals.lb - round; // 0 = the first losers round
    if (j === 0) return 0.5;
    return j % 2 ? (j + 1) / 2 + 0.5 : j / 2 + 0.75;
  }
  if (bracket === "gf") return 1000;
  return null;
}

/** The round to open: the first with a match left to play, else the last. */
export function currentTabKey(tabs = []) {
  const open = tabs.find((t) => t.done < t.total && t.matches.some((m) => m.status === "pending" && (m.player1_id || m.player2_id)));
  return (open || tabs[tabs.length - 1])?.key ?? "";
}
