// The bracket as one shareable picture, whatever is on screen in full:
// - elimination: the whole bracket (not the section on screen); double
//   elimination stacks the winners band (with the grand final) and the
//   losers band;
// - Swiss: the standings, then every round's pairings;
// - group stage: every group, one under the other: its placings (or Swiss
//   standings) and its bracket (or rounds).
//
// bracketImageLayout() is pure: it places everything with the same maths as
// the page (treePositions for single elimination, layoutBracketBand +
// withGrandFinalColumn for double) and returns drawing primitives with
// absolute coordinates. #lib/bracket-image-draw.js paints them on a canvas.

import { bracketRoundLabel, bracketRoundTotal, buildMatchOrder, groupSwissRounds, layoutBracketBand, maxRound, roundLabel, treePositions, withGrandFinalColumn } from "./bracket.js";
import { championshipMatchOf, eliminationRounds } from "./event-view.js";
import { gameModeInfo, vehiclePoolLabel } from "./tournament.js";
import { bestOfFor } from "./round-format.js";
import { eventTimeText } from "./bracket-share.js";

// Kept here for existing imports; they live in the small bracket-share.js
// so the event page can use them without loading the image code.
export { bracketShareInput, eventTimeText } from "./bracket-share.js";

export const CARD_W = 232;
export const CARD_H = 66; // number strip + two player rows
export const STRIP_H = 18;
const COL_GAP = 60;
const PAD = 40;
const HEADER_H = 176; // top bar + event title block
const SECTION_TITLE_H = 44;
const COL_LABEL_H = 30;
const SECTION_GAP = 40;
const FOOTER_H = 52;
const THIRD_GAP = 44;
export const ROW_H = 34; // table rows
const TABLE_HEAD_H = 32;
const GROUP_TITLE_H = 54;
const SWISS_GAP = 14;

const decided = (m) => m.status === "completed" || m.status === "walkover";


/** One card: its two rows (name, flag, score, won / lost), number, state. */
function cardOf(match, { x, top, number, players, playerName, status }) {
  const byId = (id) => players.find((p) => p.id === id);
  const done = decided(match);
  const walkover = match.status === "walkover";
  const bye = match.status === "completed" && Boolean(match.winner_id) && (!match.player1_id || !match.player2_id);
  const row = (slot) => {
    const id = slot === 1 ? match.player1_id : match.player2_id;
    const won = done && Boolean(id) && match.winner_id === id;
    let name = id ? playerName(id, match) : bye ? "轮空" : match.bracket === "gf" ? (slot === 1 ? "胜者组冠军" : "败者组冠军") : playerName(null, match);
    let score = "";
    if (done && id && !bye) {
      if (walkover) score = won ? "胜" : "弃";
      else score = String((slot === 1 ? match.score1 : match.score2) ?? "");
    }
    return { name, flag: id ? byId(id)?.flag || "" : "", score, won, lost: done && Boolean(id) && !won && !bye, empty: !id };
  };
  return {
    x,
    y: top,
    number,
    matchId: match.id,
    // A match nobody reached (both slots empty): the page hides it.
    voided: match.status === "completed" && !match.winner_id && !match.player1_id && !match.player2_id,
    rows: [row(1), row(2)],
    live: status === "in_progress" && match.status === "pending" && Boolean(match.player1_id && match.player2_id),
    bye,
  };
}

/** Points of an orthogonal connector from the right middle of one card to the left middle of another. */
function link(from, to) {
  const sx = from.x + CARD_W;
  const sy = from.y + CARD_H / 2;
  const ex = to.x;
  const ey = to.y + CARD_H / 2;
  if (Math.abs(sy - ey) < 1) return [[sx, sy], [ex, ey]];
  const mx = sx + (ex - sx) / 2;
  return [[sx, sy], [mx, sy], [mx, ey], [ex, ey]];
}

/** Columns -> cards, labels, links (positions relative to the section's content top). */
function placeColumns(columns, { labelOf, players, playerName, status, numbers, withBestOf = (text, _match) => text }) {
  const cards = [];
  const labels = [];
  const links = [];
  const at = new Map();
  for (const col of columns) {
    labels.push({ x: col.x, text: withBestOf(labelOf(col), col.matches[0]?.match) });
    for (const item of col.matches) {
      const card = cardOf(item.match, { x: col.x, top: item.top, number: numbers.get(item.match.id), players, playerName, status });
      card.done = Boolean(item.match.winner_id);
      cards.push(card);
      at.set(item.match.id, card);
    }
  }
  return { cards, labels, links, at };
}

/** A double-elimination (or group) bracket: winners band (+ grand final), losers band. */
function doubleSections(matches, ctx, { wbCode = "wb", lbCode = "lb", group = false, perGroup = 0 } = {}) {
  const band = matches.filter((m) => m.round > 0);
  const size = { cardHeight: CARD_H, slotHeight: CARD_H + 22, columnWidth: CARD_W, columnGap: COL_GAP };
  const wb = layoutBracketBand(band, wbCode, size);
  const lb = layoutBracketBand(band, lbCode, size);
  const gfs = group ? [] : matches.filter((m) => m.bracket === "gf").sort((a, b) => a.position - b.position);
  const wbCols = withGrandFinalColumn(wb.columns, gfs, { cardWidth: CARD_W, cardHeight: CARD_H, columnGap: COL_GAP, stackGap: 30 });
  const wbTotal = bracketRoundTotal(band, wbCode);
  const lbTotal = bracketRoundTotal(band, lbCode);
  // Numbers as on the page: winners, losers, grand final.
  const ids = [...wb.columns, ...lb.columns].flatMap((c) => c.matches.map((i) => i.match.id)).concat(gfs.map((m) => m.id));
  const numbers = new Map(ids.map((id, i) => [id, i + 1]));
  const asTop = (cols) => cols.map((c) => ({ ...c, matches: c.matches.map((i) => ({ ...i, top: i.y - CARD_H / 2 })) }));
  const singleGroup = group && !lb.columns.length;
  // A group's last winners / losers round decides who qualifies.
  const label = (side, round, total) =>
    singleGroup ? roundLabel(round, total) : group && round === 1 ? (side === "lb" ? "败者组出线战" : "胜者组出线战") : bracketRoundLabel(side, round, total);
  const out = [{
    title: singleGroup ? "" : "胜者组",
    sub: gfs.length ? "胜者组 → 总决赛" : "",
    level: 2,
    ...placeColumns(asTop(wbCols), { labelOf: (c) => (c.grandFinal ? "总决赛" : label("wb", c.round, wbTotal)), numbers, ...ctx }),
    columns: wbCols,
    next: (m) => m.next_match_id,
  }];
  if (lb.columns.length) {
    out.push({
      title: "败者组",
      sub: group ? "" : "再败即淘汰",
      level: 2,
      ...placeColumns(asTop(lb.columns), { labelOf: (c) => label("lb", c.round, lbTotal), numbers, ...ctx }),
      columns: lb.columns,
      next: (m) => m.next_match_id,
    });
  }
  // As on the page: a bye is a dashed note "轮空 · X 晋级".
  for (const sec of out) {
    for (const c of sec.cards) {
      if (!c.bye) continue;
      const through = c.rows.find((r) => !r.empty);
      c.byeNote = `轮空 · ${through?.name || ""} 晋级`;
    }
  }
  void perGroup;
  return out;
}

/** A single-elimination bracket, with the third-place match under the final. */
function singleSection(matches, ctx) {
  const order = buildMatchOrder(matches);
  const rounds = eliminationRounds(matches);
  const total = maxRound(matches);
  const pos = treePositions(rounds, { H: CARD_H, g: 16, G: 30 });
  const columns = rounds.map((r, i) => ({
    round: r.round,
    x: i * (CARD_W + COL_GAP),
    matches: r.matches.map((m) => ({ match: m, top: pos.positions[m.id]?.top ?? 0 })),
  }));
  const numbers = new Map(matches.map((m) => [m.id, order.get(m.id)]));
  const placed = placeColumns(columns, { labelOf: (c) => roundLabel(c.round, total), numbers, ...ctx });
  // Single elimination feeds by position: matches 2i and 2i+1 into i.
  // Byes are left out, cards and lines, as on the page (the bracket keeps
  // its shape: the next match stays where it is).
  const isBye = (m) => m.status === "completed" && Boolean(m.winner_id) && (!m.player1_id || !m.player2_id);
  for (let i = 1; i < rounds.length; i += 1) {
    rounds[i].matches.forEach((m, idx) => {
      for (const feeder of [rounds[i - 1].matches[idx * 2], rounds[i - 1].matches[idx * 2 + 1]]) {
        if (feeder && !isBye(feeder) && placed.at.get(feeder.id)) placed.links.push({ points: link(placed.at.get(feeder.id), placed.at.get(m.id)), done: Boolean(feeder.winner_id) });
      }
    });
  }
  placed.cards = placed.cards.filter((c) => !c.bye);
  const third = matches.find((m) => m.round === 0);
  if (third && columns.length) {
    const finalCard = placed.at.get(rounds.at(-1).matches[0]?.id);
    const top = (finalCard?.y ?? 0) + CARD_H + THIRD_GAP;
    placed.cards.push(cardOf(third, { x: columns.at(-1).x, top, number: order.get(third.id), ...ctx }));
    placed.notes = [{ x: columns.at(-1).x, y: top - 8, text: ctx.withBestOf("三四名决赛", third) }];
  }
  return { title: "", ...placed, columns };
}

/** Swiss rounds side by side: one column per round, cards stacked (byes as a note card). */
function swissSection(matches, ctx, title = "各轮对阵") {
  const rounds = groupSwissRounds(matches);
  const cards = [];
  const labels = [];
  rounds.forEach((r, i) => {
    const x = i * (CARD_W + 28);
    labels.push({ x, text: ctx.withBestOf(`第 ${r.round} 轮`, r.matches[0]) });
    r.matches.forEach((m, j) => {
      const card = cardOf(m, { x, top: j * (CARD_H + SWISS_GAP), number: m.position, ...ctx });
      if (Boolean(m.player1_id) !== Boolean(m.player2_id)) {
        card.byeNote = `轮空 · ${ctx.playerName(m.player1_id || m.player2_id, m)} 记一胜`;
      }
      cards.push(card);
    });
  });
  return { title, level: 2, cards, labels, links: [], notes: [] };
}

const signed = (n) => (n > 0 ? `+${n}` : String(n ?? 0));

/** Swiss standings as a table. */
function standingsTable(rows, ctx, { title = "积分榜", perGroup = 0, finished = false } = {}) {
  return {
    kind: "table",
    title,
    sub: perGroup ? `前 ${perGroup} 名晋级淘汰赛` : "胜 1 分 · 同分比小分净胜、对手分",
    head: [["名次", 56, "center"], ["选手", 300, "left"], ["胜-负", 80, "center"], ["积分", 70, "center"], ["小分净胜", 90, "center"], ["对手分", 80, "center"]],
    rows: rows.map((r) => ({
      cells: [String(r.rank), ctx.playerName(r.player_id), `${r.wins}-${r.losses}`, String(r.points), signed(r.game_diff), String(r.buchholz ?? 0)],
      flag: ctx.players.find((p) => p.id === r.player_id)?.flag || "",
      mark: perGroup && r.rank <= perGroup ? "晋级" : finished && r.rank === 1 && !perGroup ? "冠军" : r.byes > 0 ? "轮空" : "",
      good: Boolean(perGroup && r.rank <= perGroup),
      cut: Boolean(perGroup && r.rank === perGroup),
    })),
  };
}

/** A bracket group's placings (rank, player, how they placed). */
function placingTable(group, ctx, perGroup) {
  return {
    kind: "table",
    title: "",
    sub: "",
    head: [["名次", 56, "center"], ["选手", 300, "left"], ["结果", 200, "left"]],
    rows: group.rows.map((r) => ({
      cells: [r.how ? String(r.rank) : "–", ctx.playerName(r.player_id), r.qualified ? "出线" : r.how || ""],
      flag: ctx.players.find((p) => p.id === r.player_id)?.flag || "",
      mark: "",
      good: Boolean(r.qualified),
      cut: false,
    })),
    note: group.complete ? `前 ${perGroup} 名出线` : `前 ${perGroup} 名出线 · 小组进行中，名次随比赛结果更新`,
  };
}

/**
 * Everything to draw, absolutely placed.
 * view: "elimination" (`matches`: the bracket, `doubleElim`), "swiss"
 * (`matches`, `standings`, `totalRounds`) or "groups" (`matches`: the
 * group stage, `groups`: group_stage.groups, `groupFormat`: the group
 * stage's format, `perGroup`). `playerName(id, match)`: the page's namer.
 */
export function bracketImageLayout({
  tournament,
  matches = [],
  view = "elimination",
  doubleElim = false,
  standings = [],
  totalRounds = null,
  groups = [],
  groupFormat = "",
  perGroup = 0,
  playerName = null,
  now = new Date(),
} = {}) {
  const t = tournament || {};
  const players = t.players || [];
  playerName ??= (id) => (id ? players.find((p) => p.id === id)?.display_name || id : "TBD");
  const status = t.status || "";
  // Round headers carry the round's best-of when set: "半决赛 · BO3".
  const withBestOf = (text, match) => {
    const n = match ? bestOfFor(t, match) : null;
    return n ? `${text} · BO${n}` : text;
  };
  const ctx = { players, playerName, status, withBestOf };
  const sections = [];
  let formatTag = doubleElim ? "双败淘汰" : "单败淘汰";
  let champion = null;

  if (view === "swiss") {
    const rounds = groupSwissRounds(matches);
    const current = rounds.at(-1);
    const finished = Boolean(current) && current.round >= (totalRounds || 0) && current.matches.every((m) => m.status !== "pending");
    if (groups.length > 1) {
      // Two-stage: Swiss groups, each with its standings and rounds.
      for (const g of groups) {
        const own = matches.filter((m) => (m.swiss_group || 1) === g.group);
        sections.push({ kind: "group", title: `${g.label} 组`, sub: `${g.rows.length} 人 · 共 ${g.rounds ?? totalRounds ?? "?"} 轮` });
        sections.push(standingsTable(g.rows, ctx, { title: "", perGroup }));
        if (own.length) sections.push(swissSection(own, ctx));
      }
      formatTag = "小组赛 · 瑞士轮";
    } else {
      sections.push(standingsTable(standings, ctx, { perGroup, finished }));
      if (matches.length) sections.push(swissSection(matches, ctx));
      formatTag = `瑞士轮 · ${totalRounds ?? "?"} 轮`;
      if (finished && status === "completed" && standings[0]) champion = players.find((p) => p.id === standings[0].player_id) || { id: standings[0].player_id };
    }
  } else if (view === "groups") {
    const single = groupFormat === "single_elim";
    for (const g of groups) {
      const own = matches.filter((m) => (m.swiss_group || 1) === g.group);
      sections.push({ kind: "group", title: `${g.label} 组`, sub: g.complete ? "已结束" : "" });
      sections.push(placingTable(g, ctx, perGroup));
      sections.push(...doubleSections(own, ctx, { wbCode: single ? "gse" : "gwb", lbCode: "glb", group: true }));
    }
    formatTag = single ? "小组赛 · 单败" : "小组赛 · 双败";
  } else if (doubleElim) {
    sections.push(...doubleSections(matches, ctx));
  } else {
    sections.push(singleSection(matches, ctx));
  }

  // Links of the bands follow next_match_id.
  for (const s of sections) {
    if (!s.next) continue;
    for (const col of s.columns) {
      for (const item of col.matches) {
        const from = s.at.get(item.match.id);
        const to = s.at.get(s.next(item.match));
        if (from && to && !from.voided && !to.voided) s.links.push({ points: link(from, to), done: Boolean(item.match.winner_id) });
      }
    }
    s.cards = s.cards.filter((c) => !c.voided);
  }

  // Stack the sections; offset everything to absolute coordinates.
  let y = HEADER_H + 20;
  let contentWidth = 0;
  const out = { cards: [], labels: [], links: [], titles: [], notes: [], tables: [], groups: [] };
  for (const s of sections) {
    if (s.kind === "group") {
      out.groups.push({ x: PAD, y, text: s.title, sub: s.sub || "" });
      y += GROUP_TITLE_H;
      continue;
    }
    if (s.title) {
      out.titles.push({ x: PAD, y, text: s.title, sub: s.sub || "" });
      y += SECTION_TITLE_H;
    }
    if (s.kind === "table") {
      const width = s.head.reduce((n, [, w]) => n + w, 0);
      const height = TABLE_HEAD_H + s.rows.length * ROW_H;
      out.tables.push({ x: PAD, y, width, height, head: s.head, rows: s.rows, note: s.note || "" });
      contentWidth = Math.max(contentWidth, width);
      y += height + (s.note ? 30 : 0) + SECTION_GAP - 10;
      continue;
    }
    if (!s.cards.length) continue;
    const labelY = y;
    y += COL_LABEL_H;
    const top = y;
    let bottom = 0;
    let right = 0;
    for (const c of s.cards) {
      out.cards.push({ ...c, x: c.x + PAD, y: c.y + top });
      bottom = Math.max(bottom, c.y + CARD_H);
      right = Math.max(right, c.x + CARD_W);
    }
    for (const l of s.labels) out.labels.push({ x: l.x + PAD, y: labelY, text: l.text });
    for (const l of s.links) out.links.push({ ...l, points: l.points.map(([px, py]) => [px + PAD, py + top]) });
    for (const n of s.notes || []) out.notes.push({ ...n, x: n.x + PAD, y: n.y + top });
    contentWidth = Math.max(contentWidth, right);
    y = top + bottom + SECTION_GAP;
  }

  if (view === "elimination") {
    const champMatch = championshipMatchOf(matches, doubleElim);
    if (status === "completed" && champMatch?.winner_id) champion = players.find((p) => p.id === champMatch.winner_id) || { id: champMatch.winner_id };
  }
  const mode = gameModeInfo(t.game_mode);
  const tags = [mode?.code || "", vehiclePoolLabel(t.vehicle_pool), formatTag, `${players.length} 名选手`].filter(Boolean);
  const width = Math.max(760, contentWidth + PAD * 2);
  const stage = view === "elimination" ? "" : view === "groups" || groups.length > 1 ? "小组赛" : "";
  return {
    width,
    height: y - SECTION_GAP + 28 + FOOTER_H,
    header: {
      name: t.name || "",
      kind: status === "registration" ? "对阵预览" : status === "completed" ? "最终对阵" : stage || "对阵图",
      note: status === "registration" ? "按当前报名和种子生成，开赛时可能变化" : "",
      time: eventTimeText(t.scheduled_time),
      tags,
      champion: champion ? { name: champion.display_name || champion.id, flag: champion.flag || "" } : null,
    },
    ...out,
    stamp: now,
    flags: [...new Set([
      ...out.cards.flatMap((c) => c.rows.map((r) => r.flag)),
      ...out.tables.flatMap((tb) => tb.rows.map((r) => r.flag)),
      champion?.flag,
    ].filter(Boolean))],
  };
}

