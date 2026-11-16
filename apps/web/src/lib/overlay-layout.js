// Layout maths for the OBS overlay (routes/tournament/[id]/overlay): the
// single- and double-elimination trees (always whole, scaled to fit, the side
// panel moving under the tree when that leaves it bigger), the stage board
// and grouped Swiss. Pure functions, no #lib imports beyond plain JS helpers, so
// they can be tested with node --test.

import { bracketConnectorPath, layoutBracketBand } from "./bracket.js";
import { stageKey } from "./overlay.js";

export const isDecided = (m) => m.status === "completed" || m.status === "walkover";
export const isPlayable = (m) => m.status === "pending" && Boolean(m.player1_id && m.player2_id);
/** A bye: decided with a winner but only one player. */
export const isBye = (m) => isDecided(m) && Boolean(m.winner_id) && (!m.player1_id || !m.player2_id);

/** Name / seed / flag lookups for the overlay's player ids. */
export function playerLookup(players = []) {
  const map = new Map(players.map((p) => [p.id, p]));
  return {
    name: (id) => (!id ? "TBD" : map.get(id)?.display_name ?? id),
    seed: (id) => map.get(id)?.seed ?? null,
    flag: (id) => map.get(id)?.flag ?? null,
    /** The event player record (ladder_mmr, ladder_games, ladder_tier...). */
    get: (id) => (id ? map.get(id) ?? null : null),
  };
}

// ---------------------------------------------------------------- single elim

/** Single-elimination rounds, first round (highest number) first. */
export function treeRounds(matches = []) {
  const map = new Map();
  for (const m of matches) {
    if (!map.has(m.round)) map.set(m.round, []);
    map.get(m.round).push(m);
  }
  return [...map.entries()]
    .map(([round, ms]) => ({ round: Number(round), matches: [...ms].sort((a, b) => a.position - b.position) }))
    .sort((a, b) => b.round - a.round);
}

// ---------------------------------------------------------------- double elim

export const DT = { cardHeight: 66, slotHeight: 82, columnWidth: 250, columnGap: 56 };
const DT_HEADER = 40;
const DT_BAND_GAP = 36;

/**
 * Challonge-style double-elimination tree: winners bracket on top, losers
 * bracket below, grand final (and its reset once it has players) on the
 * right, with connectors from a match to the one its winner goes to.
 * Returns { items, headers, paths: [{ d, from }], width, height } or null.
 */
export function layoutDoubleTree(matches = [], labelOf = () => "") {
  if (!matches.length || !matches.every((m) => ["wb", "lb", "gf"].includes(m.bracket))) return null;
  const wb = layoutBracketBand(matches, "wb", DT);
  const lb = layoutBracketBand(matches, "lb", DT);
  const items = [];
  const headers = [];
  const place = (band, top) => {
    for (const col of band.columns) {
      const first = col.matches[0]?.match;
      if (first) headers.push({ key: stageKey(first), x: col.x, y: top - DT_HEADER, label: labelOf(first) });
      for (const it of col.matches) items.push({ match: it.match, x: it.x, y: top + it.y });
    }
  };
  // The winners final sits in the same column as the losers final (as on
  // Challonge), right before the grand final.
  const lastX = (band) => band.columns[band.columns.length - 1]?.x ?? 0;
  const finalX = Math.max(lastX(wb), lastX(lb));
  for (const band of [wb, lb]) {
    const last = band.columns[band.columns.length - 1];
    if (last && last.x < finalX) {
      last.x = finalX;
      for (const it of last.matches) it.x = finalX;
    }
  }
  const wbTop = DT_HEADER;
  const lbTop = wbTop + wb.height + DT_BAND_GAP + DT_HEADER;
  place(wb, wbTop);
  place(lb, lbTop);
  const gfX = finalX + DT.columnWidth + DT.columnGap;
  const wbFinal = items.find((i) => i.match.bracket === "wb" && i.match.round === 1);
  const lbFinal = items.find((i) => i.match.bracket === "lb" && i.match.round === 1);
  const gfY = wbFinal && lbFinal ? (wbFinal.y + lbFinal.y) / 2 : wbFinal?.y ?? DT.cardHeight;
  const gfs = matches
    .filter((m) => m.bracket === "gf" && (m.position === 1 || m.player1_id || m.player2_id))
    .sort((a, b) => a.position - b.position);
  gfs.forEach((m, i) => items.push({ match: m, x: gfX + i * (DT.columnWidth + DT.columnGap), y: gfY }));
  if (gfs.length) headers.push({ key: "gf:1", x: gfX, y: gfY - DT.cardHeight / 2 - DT_HEADER, label: labelOf(gfs[0]) });
  const byId = new Map(items.map((i) => [i.match.id, i]));
  const paths = [];
  for (const it of items) {
    const target = byId.get(it.match.next_match_id);
    if (!target) continue;
    if (target.match.bracket === "gf" && it.match.bracket !== "gf") {
      // Into the grand final: across to just before it, then up / down.
      const sx = it.x + DT.columnWidth;
      const mx = target.x - DT.columnGap / 2;
      paths.push({ d: `M ${sx} ${it.y} L ${mx} ${it.y} L ${mx} ${target.y} L ${target.x} ${target.y}`, from: it.match });
    } else {
      paths.push({ d: bracketConnectorPath(it, target, DT.columnWidth), from: it.match });
    }
  }
  const width = gfX + gfs.length * (DT.columnWidth + DT.columnGap) - DT.columnGap;
  const height = lbTop + lb.height;
  return { items, headers, paths, width, height };
}

// ---------------------------------------------------------------- single elim

const THIRD_GAP = 56;

/**
 * The whole single-elimination tree in the double tree's sizes: one column
 * per round, match p of a round between matches 2p−1 and 2p of the round
 * before (single elimination links rounds by position), the third-place
 * match (round 0) under the final. Same shape as layoutDoubleTree, or null.
 */
export function layoutSingleTree(matches = [], labelOf = () => "") {
  const main = matches.filter((m) => (m.bracket || "main") === "main");
  if (!main.length || main.length !== matches.length) return null;
  const rounds = treeRounds(main.filter((m) => m.round > 0));
  const items = [];
  const headers = [];
  const paths = [];
  const step = DT.columnWidth + DT.columnGap;
  let previous = null; // position → item of the round before
  rounds.forEach((r, col) => {
    const x = col * step;
    if (r.matches[0]) headers.push({ key: stageKey(r.matches[0]), x, y: 0, label: labelOf(r.matches[0]) });
    const here = new Map();
    r.matches.forEach((m, index) => {
      const feeders = previous ? [previous.get(2 * m.position - 1), previous.get(2 * m.position)].filter(Boolean) : [];
      const y = feeders.length
        ? feeders.reduce((sum, f) => sum + f.y, 0) / feeders.length
        : DT_HEADER + DT.cardHeight / 2 + index * DT.slotHeight;
      const item = { match: m, x, y };
      items.push(item);
      here.set(m.position, item);
      for (const f of feeders) paths.push({ d: bracketConnectorPath(f, item, DT.columnWidth), from: f.match });
    });
    previous = here;
  });
  const first = rounds[0]?.matches.length || 0;
  let height = DT_HEADER + Math.max(0, first - 1) * DT.slotHeight + DT.cardHeight;
  const third = main.find((m) => m.round === 0);
  const final = items.find((i) => i.match.round === 1);
  if (third && final) {
    const y = final.y + DT.cardHeight + THIRD_GAP;
    headers.push({ key: stageKey(third), x: final.x, y: y - DT.cardHeight / 2 - DT_HEADER, label: labelOf(third) });
    items.push({ match: third, x: final.x, y });
    height = Math.max(height, y + DT.cardHeight / 2);
  }
  const width = rounds.length ? rounds.length * step - DT.columnGap : 0;
  return { items, headers, paths, width, height };
}

/**
 * Where the side panel goes for a tree: on the right (the tree gets the
 * rest of the width), or under it (the full width, less height), whichever
 * draws the tree bigger. Sizes are the scene's: 1792 × 844 below the title
 * line, a 420 px panel on the right or a 176 px strip under the tree.
 * Returns { placement: "side" | "bottom", scale }.
 */
export const SCENE = { width: 1792, height: 844, sideWidth: 420, bottomHeight: 176, gap: 32 };
export function treePlacement(tree, scene = SCENE) {
  if (!tree?.width || !tree?.height) return { placement: "side", scale: 1 };
  const fit = (w, h) => Math.min(1.3, w / tree.width, h / tree.height);
  // A little room for the headers and the cards' shadows.
  const side = fit(scene.width - scene.sideWidth - scene.gap - 24, scene.height - 24);
  const bottom = fit(scene.width - 24, scene.height - scene.bottomHeight - scene.gap - 24);
  // Under only when it is clearly better: the side panel shows more.
  return bottom > side * 1.03 ? { placement: "bottom", scale: bottom } : { placement: "side", scale: side };
}

// ---------------------------------------------------------------- stage board

const BAND_ORDER = ["sw", "gse", "gwb", "glb", "wb", "lb", "gf"];
const BAND_NAMES = { sw: "SWISS", gse: "GROUPS", gwb: "GROUPS · UPPER", glb: "GROUPS · LOWER", wb: "UPPER BRACKET", lb: "LOWER BRACKET", gf: "GRAND FINAL" };
export const BOARD_CARD_H = 58;
export const BOARD_GAP = 8;

/**
 * Stage board bands (Swiss and group stages): one band per bracket, one
 * column per stage. Swiss shows only the selected round and the one before.
 */
export function boardBands(stages = [], selectedKey = null) {
  const bands = new Map();
  for (const s of stages) {
    if (!bands.has(s.bracket)) bands.set(s.bracket, []);
    bands.get(s.bracket).push(s);
  }
  if (bands.has("sw")) {
    const sw = bands.get("sw");
    const at = Math.max(0, sw.findIndex((s) => s.key === selectedKey));
    bands.set("sw", sw.slice(Math.max(0, at - 1), at + 1));
  }
  return [...bands.entries()]
    .sort((a, b) => BAND_ORDER.indexOf(a[0]) - BAND_ORDER.indexOf(b[0]))
    .map(([bracket, columns]) => ({ bracket, name: BAND_NAMES[bracket] || bracket.toUpperCase(), columns }));
}

/** Scale that fits the board next to the side panel. */
export function boardScale(bands = []) {
  if (!bands.length) return 1;
  const height = bands.reduce(
    (sum, band) => sum + 44 + Math.max(...band.columns.map((c) => c.matches.length)) * (BOARD_CARD_H + BOARD_GAP),
    0,
  );
  const width = Math.max(...bands.map((band) => band.columns.length)) * (232 + 16);
  return Math.min(1.4, 820 / height, 1320 / width);
}

// ---------------------------------------------------------------- grouped Swiss

/**
 * Swiss in several groups: each group's rounds and current round (groups
 * play at their own pace). `wantedStage` ("sw:3") pins the round. Group i
 * is swiss_group i + 1. [] for a single pool.
 */
export function swissGroupViews(stages = [], groupStage = null, wantedStage = null) {
  const groups = groupStage?.groups || [];
  const sw = stages.filter((s) => s.bracket === "sw");
  if (!sw.length || groups.length < 2) return [];
  const perGroup = Number(groupStage?.per_group) || 0;
  const wanted = /^sw:(\d+)$/.exec(String(wantedStage || ""));
  return groups.map((g, i) => {
    const rounds = sw
      .map((s) => ({ ...s, matches: s.matches.filter((m) => Number(m.swiss_group) === i + 1) }))
      .filter((r) => r.matches.length);
    const current =
      (wanted && rounds.find((r) => r.round === Number(wanted[1]))) ||
      rounds.find((r) => r.matches.some(isPlayable)) ||
      rounds.find((r) => r.matches.some((m) => !isDecided(m) && (m.player1_id || m.player2_id))) ||
      [...rounds].reverse().find((r) => r.matches.some(isDecided)) ||
      rounds[0] ||
      null;
    return { label: g.label, rows: g.rows, perGroup, rounds, current };
  });
}

/**
 * The group shown: the live match's group; else the group shown last while
 * it still has a match to play (so a group's next round follows its last
 * one); else the next match's group; else the groups take turns (tick).
 */
export function pickFocusGroup(groups = [], { liveMatch = null, nextMatch = null, lastLabel = null, tick = 0 } = {}) {
  if (!groups.length) return null;
  const of = (m) => (m?.bracket === "sw" && m.swiss_group ? groups[Number(m.swiss_group) - 1] || null : null);
  const live = of(liveMatch);
  if (live) return live;
  const last = groups.find((g) => g.label === lastLabel);
  if (last?.rounds.some((r) => r.matches.some(isPlayable))) return last;
  return of(nextMatch) || groups[tick % groups.length];
}

/** The focus group's rounds up to its current one (the last three). */
export function focusGroupRounds(group) {
  if (!group?.current) return [];
  const at = group.rounds.indexOf(group.current);
  return group.rounds.slice(Math.max(0, at - 2), at + 1);
}

export const GROUP_COL_W = 470;

export function groupBoardScale(rounds = []) {
  if (!rounds.length) return 1;
  const rows = Math.max(1, ...rounds.map((r) => r.matches.length));
  const height = 90 + rows * 62;
  const width = rounds.length * (GROUP_COL_W + 20) + 40;
  return Math.min(1.6, 800 / height, 1320 / width);
}
