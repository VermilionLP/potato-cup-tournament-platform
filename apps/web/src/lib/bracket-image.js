// The bracket as one shareable picture: the whole elimination bracket (not
// the section on screen), and for double elimination the winners band
// (with the grand final) and the losers band stacked into one image.
//
// bracketImageLayout() is pure: it places everything with the same maths as
// the page (treePositions for single elimination, layoutBracketBand +
// withGrandFinalColumn for double) and returns drawing primitives with
// absolute coordinates. #lib/bracket-image-draw.js paints them on a canvas.

import { bracketRoundLabel, bracketRoundTotal, buildMatchOrder, layoutBracketBand, maxRound, roundLabel, treePositions, withGrandFinalColumn } from "./bracket.js";
import { championshipMatchOf, eliminationRounds } from "./event-view.js";
import { gameModeInfo, vehiclePoolLabel } from "./tournament.js";

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

const decided = (m) => m.status === "completed" || m.status === "walkover";

/** "2026/11/14 周六 20:00" from the stored Beijing time, or "". */
export function eventTimeText(scheduled) {
  const m = String(scheduled || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (!m) return "";
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${m[1]}/${m[2]}/${m[3]} ${week}${m[4] ? ` ${m[4].padStart(2, "0")}:${m[5]}` : ""}`;
}

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
function placeColumns(columns, { labelOf, players, playerName, status, numbers }) {
  const cards = [];
  const labels = [];
  const links = [];
  const at = new Map();
  for (const col of columns) {
    labels.push({ x: col.x, text: labelOf(col) });
    for (const item of col.matches) {
      const card = cardOf(item.match, { x: col.x, top: item.top, number: numbers.get(item.match.id), players, playerName, status });
      card.done = Boolean(item.match.winner_id);
      cards.push(card);
      at.set(item.match.id, card);
    }
  }
  return { cards, labels, links, at };
}

/**
 * Everything to draw, absolutely placed. `matches`: the elimination bracket
 * (bracketMatchesOf); `playerName(id, match)`: the page's namer.
 */
export function bracketImageLayout({ tournament, matches = [], doubleElim = false, playerName = null, now = new Date() } = {}) {
  const t = tournament || {};
  const players = t.players || [];
  playerName ??= (id) => (id ? players.find((p) => p.id === id)?.display_name || id : "TBD");
  const status = t.status || "";
  const order = buildMatchOrder(matches);
  const sections = [];

  if (doubleElim) {
    const band = matches.filter((m) => m.round > 0);
    const size = { cardHeight: CARD_H, slotHeight: CARD_H + 22, columnWidth: CARD_W, columnGap: COL_GAP };
    const wb = layoutBracketBand(band, "wb", size);
    const lb = layoutBracketBand(band, "lb", size);
    const gfs = matches.filter((m) => m.bracket === "gf").sort((a, b) => a.position - b.position);
    const wbCols = withGrandFinalColumn(wb.columns, gfs, { cardWidth: CARD_W, cardHeight: CARD_H, columnGap: COL_GAP, stackGap: 30 });
    const wbTotal = bracketRoundTotal(band, "wb");
    const lbTotal = bracketRoundTotal(band, "lb");
    // Numbers as on the page: winners, losers, grand final.
    const ids = [...wb.columns, ...lb.columns].flatMap((c) => c.matches.map((i) => i.match.id)).concat(gfs.map((m) => m.id));
    const numbers = new Map(ids.map((id, i) => [id, i + 1]));
    const asTop = (cols) => cols.map((c) => ({ ...c, matches: c.matches.map((i) => ({ ...i, top: i.y - CARD_H / 2 })) }));
    sections.push({
      title: "胜者组",
      sub: gfs.length ? "胜者组 → 总决赛" : "",
      ...placeColumns(asTop(wbCols), {
        labelOf: (c) => (c.grandFinal ? "总决赛" : bracketRoundLabel("wb", c.round, wbTotal)),
        players, playerName, status, numbers,
      }),
      columns: wbCols,
      next: (m) => m.next_match_id,
    });
    if (lb.columns.length) {
      sections.push({
        title: "败者组",
        sub: "再败即淘汰",
        ...placeColumns(asTop(lb.columns), { labelOf: (c) => bracketRoundLabel("lb", c.round, lbTotal), players, playerName, status, numbers }),
        columns: lb.columns,
        next: (m) => m.next_match_id,
      });
    }
  } else {
    const rounds = eliminationRounds(matches);
    const total = maxRound(matches);
    const pos = treePositions(rounds, { H: CARD_H, g: 16, G: 30 });
    const columns = rounds.map((r, i) => ({
      round: r.round,
      x: i * (CARD_W + COL_GAP),
      matches: r.matches.map((m) => ({ match: m, top: pos.positions[m.id]?.top ?? 0 })),
    }));
    const numbers = new Map(matches.map((m) => [m.id, order.get(m.id)]));
    const placed = placeColumns(columns, { labelOf: (c) => roundLabel(c.round, total), players, playerName, status, numbers });
    // Single elimination feeds by position: matches 2i and 2i+1 into i.
    for (let i = 1; i < rounds.length; i += 1) {
      rounds[i].matches.forEach((m, idx) => {
        for (const feeder of [rounds[i - 1].matches[idx * 2], rounds[i - 1].matches[idx * 2 + 1]]) {
          if (feeder && placed.at.get(feeder.id)) placed.links.push({ points: link(placed.at.get(feeder.id), placed.at.get(m.id)), done: Boolean(feeder.winner_id) });
        }
      });
    }
    const third = matches.find((m) => m.round === 0);
    if (third && columns.length) {
      const finalCard = placed.at.get(rounds.at(-1).matches[0]?.id);
      const top = (finalCard?.y ?? 0) + CARD_H + THIRD_GAP;
      const card = cardOf(third, { x: columns.at(-1).x, top, number: order.get(third.id), players, playerName, status });
      placed.cards.push(card);
      placed.notes = [{ x: columns.at(-1).x, y: top - 8, text: "三四名决赛" }];
    }
    sections.push({ title: "", ...placed, columns });
  }

  // Links of the double-elimination bands follow next_match_id.
  for (const s of sections) {
    if (!s.next) continue;
    for (const col of s.columns) {
      for (const item of col.matches) {
        const from = s.at.get(item.match.id);
        const to = s.at.get(s.next(item.match));
        if (from && to) s.links.push({ points: link(from, to), done: Boolean(item.match.winner_id) });
      }
    }
  }

  // Stack the sections; offset everything to absolute coordinates.
  let y = HEADER_H + 20;
  let contentWidth = 0;
  const out = { cards: [], labels: [], links: [], titles: [], notes: [] };
  for (const s of sections) {
    if (s.title) {
      out.titles.push({ x: PAD, y, text: s.title, sub: s.sub || "" });
      y += SECTION_TITLE_H;
    }
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

  const champMatch = championshipMatchOf(matches, doubleElim);
  const champion = status === "completed" && champMatch?.winner_id ? players.find((p) => p.id === champMatch.winner_id) || { id: champMatch.winner_id } : null;
  const mode = gameModeInfo(t.game_mode);
  const tags = [
    mode?.code || "",
    vehiclePoolLabel(t.vehicle_pool),
    doubleElim ? "双败淘汰" : "单败淘汰",
    `${players.length} 名选手`,
  ].filter(Boolean);
  const width = Math.max(760, contentWidth + PAD * 2);
  return {
    width,
    height: y - SECTION_GAP + 28 + FOOTER_H,
    header: {
      name: t.name || "",
      kind: status === "registration" ? "对阵预览" : status === "completed" ? "最终对阵" : "对阵图",
      note: status === "registration" ? "按当前报名和种子生成，开赛时可能变化" : "",
      time: eventTimeText(t.scheduled_time),
      tags,
      champion: champion ? { name: champion.display_name || champion.id, flag: champion.flag || "" } : null,
    },
    ...out,
    stamp: now,
    flags: [...new Set([...out.cards.flatMap((c) => c.rows.map((r) => r.flag)), champion?.flag].filter(Boolean))],
  };
}
