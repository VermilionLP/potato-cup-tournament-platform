// A player's season recap image (a 1080 × 1350 PNG to share), from GET
// /players/:id/season-recap. Like the results image (result-image.js) its
// own text is English; players' and events' names stay as they are.
// recapTiles / recapRows are pure (tested); drawSeasonRecap needs a browser.

import { flagSrc } from "./flags.js";
import { IMAGE_W, IMAGE_H, FONT, fit, load, rounded } from "./result-image.js";

/** "1st", "2nd", "3-4th"… for a place { place, to }. */
export function ordinal(place, to = place) {
  const n = Number(to > place ? to : place);
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return to > place ? `${place}-${to}${suffix}` : `${n}${suffix}`;
}

// "Potato Cup Weekly #31" → "Weekly #31".
const short = (name) => String(name || "").replace(/^(FamilyX\s+)?Potato Cup\s+/i, "");

/** The six number tiles: [{ label, value, sub }]. */
export function recapTiles(r) {
  const rate = r.win_rate == null ? "—" : `${Math.round(r.win_rate * 100)}%`;
  return [
    { label: "EVENTS", value: String(r.events || 0), sub: r.podiums ? `${r.podiums} podium${r.podiums === 1 ? "" : "s"}` : "" },
    { label: "MATCHES", value: `${r.wins || 0}-${r.losses || 0}`, sub: `${r.matches || 0} played` },
    { label: "WIN RATE", value: rate, sub: "" },
    { label: "TITLES", value: String(r.titles || 0), sub: "" },
    { label: "BEST STREAK", value: String(r.best_streak || 0), sub: r.best_streak ? "wins in a row" : "" },
    { label: "PEAK MMR", value: r.peak_mmr == null ? "—" : String(r.peak_mmr), sub: "" },
  ];
}

/** The events the player won, newest first, as short names. */
export function recapTitles(r) {
  return [...(r.title_events || [])]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map((e) => short(e.name));
}

/**
 * The title chips that fit in `slots`: all of them, or the first slots - 1
 * and a "+N more" chip. [{ text, more }].
 */
export function titleChips(names, slots) {
  if (slots <= 0) return [];
  if (names.length <= slots) return names.map((text) => ({ text, more: false }));
  const shown = names.slice(0, Math.max(0, slots - 1)).map((text) => ({ text, more: false }));
  return [...shown, { text: `+${names.length - shown.length} more`, more: true }];
}

/**
 * The lines under the tiles: [{ label, text }], only those with something
 * to say. With titles the best finish is a title, so the titles block
 * (recapTitles) says it instead.
 */
export function recapRows(r) {
  const rows = [];
  if (r.best && !r.title_events?.length) rows.push({ label: "Best finish", text: `${ordinal(r.best.place, r.best.to)}  ·  ${short(r.best.event?.name)}` });
  if (r.rival) rows.push({ label: "Most faced", text: `${r.rival.name}  ·  ${r.rival.won}-${r.rival.played - r.rival.won} in ${r.rival.played} match${r.rival.played === 1 ? "" : "es"}` });
  if (r.vehicle) rows.push({ label: "Most played vehicle", text: `${r.vehicle.name}  ·  ${r.vehicle.times} match${r.vehicle.times === 1 ? "" : "es"}` });
  return rows;
}

/** The season points line ("245 PTS  ·  #1 of 8"), or "". */
export function pointsLine(r) {
  const p = r.points;
  if (!p || !p.total) return "";
  return `${p.total} PTS  ·  #${p.rank} of ${p.of}`;
}

/** Draws the recap on `canvas` (sized IMAGE_W × IMAGE_H). */
export async function drawSeasonRecap(canvas, r) {
  canvas.width = IMAGE_W;
  canvas.height = IMAGE_H;
  const ctx = canvas.getContext("2d");
  const W = IMAGE_W;
  const H = IMAGE_H;

  const bg = ctx.createRadialGradient(W / 2, H * 0.3, 80, W / 2, H * 0.4, H);
  bg.addColorStop(0, "#1b2028");
  bg.addColorStop(1, "#07090c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const slash = (x, w, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#ff7a00");
    g.addColorStop(1, "#ff3d00");
    ctx.fillStyle = g;
    ctx.beginPath();
    const lean = H * 0.38;
    ctx.moveTo(x + lean, 0);
    ctx.lineTo(x + lean + w, 0);
    ctx.lineTo(x + w, H);
    ctx.lineTo(x, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  slash(W * 0.74, 46, 0.85);
  slash(W * 0.74 + 64, 12, 0.55);
  slash(-W * 0.34, 22, 0.45);

  const [logo, flag] = await Promise.all([load("/overlay/potato-cup-logo.webp"), load(flagSrc(r.player?.flag))]);
  let y = 60;
  if (logo) {
    const lw = 520;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh + 30;
  }

  ctx.textAlign = "center";
  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = "#ff7a00";
  ctx.fillText(`${r.season} SEASON RECAP`, W / 2, y + 30);
  y += 60;

  // Name with the flag before it.
  const name = r.player?.name || r.player?.id || "";
  const size = fit(ctx, name, W - 300, 88);
  const nameW = ctx.measureText(name).width;
  const flagW = flag ? 72 : 0;
  const startX = W / 2 - (nameW + flagW + (flagW ? 22 : 0)) / 2;
  if (flag) ctx.drawImage(flag, startX, y + 18, 72, 54);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.fillText(name, startX + flagW + (flagW ? 22 : 0), y + 72);
  y += 116;

  const pts = pointsLine(r);
  if (pts) {
    ctx.textAlign = "center";
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = "#fcd34d";
    ctx.fillText(pts, W / 2, y + 26);
    y += 50;
  }
  y += 20;

  // Number tiles, 3 × 2.
  const tiles = recapTiles(r);
  const x0 = 90;
  const gap = 20;
  const tw = (W - 2 * x0 - 2 * gap) / 3;
  const th = 158;
  tiles.forEach((t, i) => {
    const tx = x0 + (i % 3) * (tw + gap);
    const ty = y + Math.floor(i / 3) * (th + gap);
    ctx.fillStyle = "rgba(24, 29, 37, 0.94)";
    rounded(ctx, tx, ty, tw, th, 20);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(t.label, tx + tw / 2, ty + 40);
    ctx.fillStyle = t.label === "TITLES" && t.value !== "0" ? "#fbbf24" : "#ffffff";
    fit(ctx, t.value, tw - 30, 64);
    ctx.fillText(t.value, tx + tw / 2, ty + 104);
    if (t.sub) {
      ctx.font = `600 20px ${FONT}`;
      ctx.fillStyle = "#64748b";
      ctx.fillText(t.sub, tx + tw / 2, ty + 138);
    }
  });
  y += 2 * th + gap + 24;

  // The lines go at the bottom; the titles fill the space above them.
  const rows = recapRows(r);
  const rowH = 74;
  const rowsTop = H - 70 - rows.length * (rowH + 12) + 12;
  const titles = recapTitles(r);
  if (titles.length) {
    // One title gets a wide chip, a few two columns, more three.
    const cols = titles.length === 1 ? 1 : titles.length <= 4 ? 2 : 3;
    const chipGap = 8;
    const chipH = 42;
    const headH = 38;
    const chipW = (W - 2 * x0 - chipGap * (cols - 1)) / cols;
    const free = rowsTop - 16 - y;
    const fitRows = Math.max(1, Math.floor((free - headH + chipGap) / (chipH + chipGap)));
    const chips = titleChips(titles, fitRows * cols);
    const lines = Math.ceil(chips.length / cols);
    const blockH = headH + lines * (chipH + chipGap) - chipGap;
    // Centred in the space between the tiles and the lines.
    y += Math.max(0, Math.floor((free - blockH) / 2));
    ctx.textAlign = "center";
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(titles.length === 1 ? "🏆  TITLE" : `🏆  ${titles.length} TITLES`, W / 2, y + 20);
    y += headH;
    chips.forEach((c, i) => {
      // The last line is centred when it isn't full.
      const row = Math.floor(i / cols);
      const inRow = row === lines - 1 ? chips.length - row * cols : cols;
      const offset = ((cols - inRow) * (chipW + chipGap)) / 2;
      const cx = x0 + offset + (i % cols) * (chipW + chipGap);
      const cy = y + row * (chipH + chipGap);
      ctx.fillStyle = c.more ? "rgba(24, 29, 37, 0.96)" : "rgba(58, 44, 14, 0.96)";
      ctx.strokeStyle = c.more ? "#334155" : "rgba(251, 191, 36, 0.55)";
      ctx.lineWidth = 2;
      rounded(ctx, cx, cy, chipW, chipH, 12);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = c.more ? "#94a3b8" : "#fde68a";
      fit(ctx, c.text, chipW - 24, cols === 3 ? 22 : 24, 700);
      ctx.fillText(c.text, cx + chipW / 2, cy + chipH / 2 + 7);
    });
    y += lines * (chipH + chipGap) + 2;
  }

  // Lines: label on the left, text on the right.
  rows.forEach((row, i) => {
    // Without titles the lines sit in the middle of the space left.
    const first = titles.length ? Math.max(y, rowsTop) : y + Math.max(0, Math.floor((rowsTop - y) / 2));
    const top = first + i * (rowH + 12);
    if (top + rowH > H - 58) return;
    ctx.fillStyle = "rgba(24, 29, 37, 0.94)";
    rounded(ctx, x0, top, W - 2 * x0, rowH, 16);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = "#ff9a3c";
    ctx.fillText(row.label, x0 + 26, top + rowH / 2 + 9);
    const labelW = ctx.measureText(row.label).width;
    ctx.textAlign = "right";
    ctx.fillStyle = "#e2e8f0";
    fit(ctx, row.text, W - 2 * x0 - labelW - 80, 28, 700);
    ctx.fillText(row.text, W - x0 - 26, top + rowH / 2 + 10);
  });

  ctx.textAlign = "center";
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = "#475569";
  ctx.fillText("Potato Cup  ·  War Thunder", W / 2, H - 36);
  return canvas;
}
