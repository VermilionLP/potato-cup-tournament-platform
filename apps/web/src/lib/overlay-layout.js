// Layout maths for the OBS overlay (routes/tournament/[id]/overlay): the
// single-elimination tree, the double-elimination tree, the stage board and
// grouped Swiss. Pure functions, no $lib imports beyond plain JS helpers, so
// they can be tested with node --test.

import { bracketConnectorPath, layoutBracketBand, treePositions } from "./bracket.js";
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

/** Card and connector sizes for a tree whose first shown round has `count` matches. */
export function treeSpecs(count) {
  if (count >= 8) {
    // 16 players or more
    return {
      H: 76,
      g: 14,
      G: 24,
      cardWidth: "w-72",
      textClass: "text-lg md:text-xl font-bold",
      scoreClass: "text-lg md:text-xl px-2.5 py-0.5 min-w-[2.2rem]",
      paddingClass: "py-1.5 px-6",
      colGap: "gap-6",
      slotOffset: 19,
      connMid: 12,
      connWidth: 12,
      connGap: 24,
    };
  }
  // 8 players or fewer
  return {
    H: 144,
    g: 32,
    G: 96,
    cardWidth: "w-96",
    textClass: "text-2xl md:text-3xl lg:text-[2.1rem] font-black",
    scoreClass: "text-2xl md:text-3xl lg:text-[2.1rem] px-3 py-1 min-w-[3.5rem]",
    paddingClass: "p-4 px-5",
    colGap: "gap-8",
    slotOffset: 40,
    connMid: 16,
    connWidth: 16,
    connGap: 32,
  };
}

/**
 * Large brackets (16+ first-round matches) show 16-player sections in a
 * carousel until the final stage (the last four rounds) starts.
 * Returns { rounds, isLarge, sectionCount, finalStartRound, showFinal }.
 */
export function treeSections(rounds, { sectionIndex = 0, activeRound = null, selectedRound = null } = {}) {
  const maxRound = rounds.length ? Math.max(...rounds.map((r) => r.round)) : 1;
  const firstCount = rounds.find((r) => r.round === maxRound)?.matches.length || 0;
  const isLarge = firstCount >= 16;
  const sectionCount = Math.max(1, Math.ceil(firstCount / 8));
  const finalStartRound = Math.max(1, maxRound - 3);
  const finalRound = rounds.find((r) => r.round === finalStartRound);
  const finalStarted =
    !isLarge || !finalRound || finalRound.matches.some((m) => m.player1_id || m.player2_id || isDecided(m));
  const showFinal =
    !isLarge ||
    finalStarted ||
    (activeRound !== null && activeRound <= finalStartRound) ||
    (selectedRound ?? maxRound) <= finalStartRound;
  let shown = rounds;
  if (isLarge && showFinal) shown = rounds.filter((r) => r.round <= finalStartRound);
  else if (isLarge) {
    shown = rounds
      .filter((r) => r.round >= finalStartRound && r.round <= maxRound)
      .map((r) => {
        const size = 8 >> (maxRound - r.round);
        const start = sectionIndex * size;
        return { ...r, matches: r.matches.slice(start, start + size) };
      });
  }
  return { rounds: shown, maxRound, isLarge, sectionCount, finalStartRound, showFinal };
}

// Card tops and centres of the single-elimination tree: treePositions in
// bracket.js, shared with the event page.
export { treePositions };

// ---------------------------------------------------------------- double elim

export const DT = { cardHeight: 66, slotHeight: 82, columnWidth: 250, columnGap: 56 };
const DT_HEADER = 40;
const DT_BAND_GAP = 36;

/**
 * Challonge-style double-elimination tree: winners bracket on top, losers
 * bracket below, grand final (and its reset once it has players) on the
 * right, with connectors from a match to the one its winner goes to.
 * Returns { items, headers, paths, width, height } or null.
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
      paths.push(`M ${sx} ${it.y} L ${mx} ${it.y} L ${mx} ${target.y} L ${target.x} ${target.y}`);
    } else {
      paths.push(bracketConnectorPath(it, target, DT.columnWidth));
    }
  }
  const width = gfX + gfs.length * (DT.columnWidth + DT.columnGap) - DT.columnGap;
  const height = lbTop + lb.height;
  return { items, headers, paths, width, height };
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
  return Math.min(1.4, 840 / height, 1440 / width);
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
  return Math.min(1.6, 800 / height, 1400 / width);
}
