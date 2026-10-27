// Stream overlay helpers for every format: single elimination, double
// elimination, Swiss and the group stage of two-stage events.
//
// A "stage" is one round of one bracket, keyed "<bracket>:<round>" (e.g.
// "wb:2", "lb:1", "gf:1", "sw:3", "main:1"). Round numbers repeat across the
// winners bracket, losers bracket and grand final, so the overlay must never
// group matches by round number alone.

import { bracketRoundLabel, buildMatchOrder, roundLabel, roundShortLabel } from "./bracket.js";

export const GROUP_STAGE_BRACKETS = ["sw", "gse", "gwb", "glb"];
const decided = (m) => m.status === "completed" || m.status === "walkover";
const isBye = (m) => decided(m) && m.winner_id && (!m.player1_id || !m.player2_id);

export const stageKey = (m) => `${m.bracket || "main"}:${m.round}`;

function bracketTotals(matches) {
  const totals = {};
  for (const m of matches) {
    const b = m.bracket || "main";
    if (m.round > (totals[b] || 0)) totals[b] = m.round;
  }
  return totals;
}

/** { label, short } for a stage of `matches` (the matches shown). */
export function stageLabels(bracket, round, totals) {
  const total = totals[bracket] || 1;
  switch (bracket) {
    case "sw":
      return { label: `瑞士轮 第 ${round} 轮`, short: `R${round}` };
    case "gse":
      return { label: `小组赛 · ${roundLabel(round, total)}`, short: `G·${roundShortLabel(round, total)}` };
    case "gwb":
      return { label: `小组赛 · ${round === 1 ? "胜者组出线战" : bracketRoundLabel("wb", round, total)}`, short: `GW${total - round + 1}` };
    case "glb":
      return { label: `小组赛 · ${round === 1 ? "败者组出线战" : bracketRoundLabel("lb", round, total)}`, short: `GL${total - round + 1}` };
    case "wb":
      return { label: bracketRoundLabel("wb", round, total), short: round === 1 ? "WBF" : `WB${total - round + 1}` };
    case "lb":
      return { label: bracketRoundLabel("lb", round, total), short: round === 1 ? "LBF" : `LB${total - round + 1}` };
    case "gf":
      return { label: "总决赛", short: "GF" };
    default:
      return { label: roundLabel(round, total), short: roundShortLabel(round, total) };
  }
}

/**
 * Stages in playing order: [{ key, bracket, round, label, short, matches }].
 * Byes are left out of `matches`; a stage made only of byes is dropped.
 */
export function overlayStages(matches = []) {
  const order = buildMatchOrder(matches);
  const totals = bracketTotals(matches);
  const byKey = new Map();
  for (const m of matches) {
    const key = stageKey(m);
    if (!byKey.has(key)) byKey.set(key, { key, bracket: m.bracket || "main", round: m.round, all: [] });
    byKey.get(key).all.push(m);
  }
  const firstOrder = (s) => Math.min(...s.all.map((m) => order.get(m.id) ?? Infinity));
  return [...byKey.values()]
    .map((s) => ({
      ...s,
      ...stageLabels(s.bracket, s.round, totals),
      matches: s.all
        .filter((m) => !isBye(m))
        .sort((a, b) => (a.swiss_group || 0) - (b.swiss_group || 0) || a.position - b.position || a.id - b.id),
      first: firstOrder(s),
    }))
    .filter((s) => s.matches.length)
    .sort((a, b) => a.first - b.first)
    .map(({ all, first, ...s }) => s);
}

/** Labels for one match (HUD badge, ticker). */
export function matchStageLabels(match, matches = []) {
  if (!match) return { label: "", short: "" };
  return stageLabels(match.bracket || "main", match.round, bracketTotals(matches));
}

/**
 * The stage to show: an explicit key (or a legacy round number) when it
 * exists, otherwise the first stage that still has unplayed matches, or the
 * last stage once everything is played.
 */
export function pickStage(stages = [], wanted = null) {
  if (!stages.length) return null;
  if (wanted !== null && wanted !== undefined && wanted !== "") {
    const text = String(wanted);
    const exact = stages.find((s) => s.key === text);
    if (exact) return exact;
    if (/^-?\d+$/.test(text)) {
      const round = Number(text);
      const legacy = stages.find((s) => s.round === round && ["main", "sw"].includes(s.bracket))
        || stages.find((s) => s.round === round);
      if (legacy) return legacy;
    }
  }
  return stages.find((s) => s.matches.some((m) => !decided(m))) || stages[stages.length - 1];
}

/**
 * Players still in the event, for dimming eliminated players; null when
 * nobody is eliminated by losing a match (Swiss).
 * Single elimination: one loss. Double elimination: a loss in the losers
 * bracket or the grand final, or a winners-bracket loss without a
 * losers-bracket slot.
 */
export function playersStillIn(players = [], matches = [], { swiss = false } = {}) {
  if (swiss) return null;
  const alive = new Set(players.map((p) => p.id));
  const doubleElim = matches.some((m) => m.bracket === "wb" || m.bracket === "gwb");
  const losses = new Map();
  for (const m of matches) {
    if (!decided(m) || !m.winner_id || !m.player1_id || !m.player2_id) continue;
    const loser = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
    losses.set(loser, (losses.get(loser) || 0) + 1);
    if (!doubleElim || ["lb", "glb", "gf", "main", "gse"].includes(m.bracket)) alive.delete(loser);
  }
  // A grand-final loser before a reset may still be in; the last decided
  // grand final settles it.
  const gf = matches.filter((m) => m.bracket === "gf" && decided(m) && m.winner_id).sort((a, b) => b.position - a.position);
  if (gf.length && gf[0].position === 1 && matches.some((m) => m.bracket === "gf" && m.position === 2 && !decided(m) && m.player1_id && m.player2_id)) {
    const first = gf[0];
    alive.add(first.winner_id === first.player1_id ? first.player2_id : first.player1_id);
  }
  return alive;
}
