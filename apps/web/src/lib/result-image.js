// Results image of a finished event (a PNG to post in QQ / Discord): the
// rows it lists (the top 8 places) and the drawing on a <canvas>. The
// image's own text is English (players' names stay as they are). resultRows is pure (tested);
// drawResultImage needs a browser.

import { flagSrc } from "./flags.js";

export const IMAGE_W = 1080;
export const IMAGE_H = 1350;

/** "第 3-4 名" / "第 1 名 (冠军)" → { from: 3, to: 4 }. */
export function placeOf(rank) {
  const m = String(rank || "").match(/(\d+)(?:\s*-\s*(\d+))?/);
  return m ? { from: Number(m[1]), to: Number(m[2] || m[1]) } : null;
}

/**
 * The first `n` placings with their prize and points from the points table:
 * [{ from, to, place: "1" | "3-4", name, flag, prize, points }].
 */
export function resultRows(standings = [], table = [], n = 8) {
  const rowFor = (p) => (table || []).find((r) => Number(r.from) <= p.from && p.from <= Number(r.to));
  return standings
    .map((s) => ({ s, p: placeOf(s.rank) }))
    .filter(({ p }) => p)
    .slice(0, n)
    .map(({ s, p }) => {
      const r = rowFor(p);
      return {
        ...p,
        place: p.to > p.from ? `${p.from}-${p.to}` : String(p.from),
        name: s.display_name || s.id,
        flag: s.flag || "",
        prize: Number(r?.prize) || 0,
        points: Number(r?.points) || 0,
      };
    });
}

/** The vehicle played most often in the event's confirmed Ban / Picks, or null. */
export function topVehicle(matches = []) {
  const count = new Map();
  for (const m of matches) {
    const s = m.banpick?.state;
    if (s?.phase !== "done") continue;
    const v = s.vehicle || s.group;
    if (v) count.set(v, (count.get(v) || 0) + 1);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? { name: best[0], count: best[1] } : null;
}

const MODES = { ab: "AB", rb: "RB", sb: "SB" };
const POOLS = { prop: "Prop", "legacy-jet": "Legacy Jet", "top-jet": "Top Jet", proleague: "Pro League BVR" };
const FORMATS = { single_elim: "Single Elimination", double_elim: "Double Elimination", swiss: "Swiss" };

/** "2026-10-31 · RB · Prop · Single Elimination · 15 Players". */
export function infoLine(t = {}) {
  const day = String(t.scheduled_time || "").match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const date = day ? `${day[1]}-${day[2].padStart(2, "0")}-${day[3].padStart(2, "0")}` : "";
  const format = t.playoff_format
    ? `${t.format === "swiss" ? "Swiss Groups" : "Groups"} + ${FORMATS[t.playoff_format] || t.playoff_format}`
    : FORMATS[t.format] || "";
  const count = (t.players || []).length || t.player_count || 0;
  return [date, MODES[t.game_mode] || "", POOLS[t.vehicle_pool] || "", format, count ? `${count} Players` : ""].filter(Boolean).join("  ·  ");
}

/** "10,000 Golden Eagles" / "60 PTS" for a row; "" without either. */
export function rewardText(r, both = false) {
  const prize = r.prize ? `${r.prize.toLocaleString("en-US")} Golden Eagles` : "";
  const points = r.points ? `${r.points} PTS` : "";
  return both ? [prize, points].filter(Boolean).join("  ·  ") : prize || points;
}

const load = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const MEDAL = { 1: "#fbbf24", 2: "#cbd5e1", 3: "#f59e0b" };

// Rounded rectangle path (ctx.roundRect is missing on older phone browsers).
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) return ctx.roundRect(x, y, w, h, r);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, max, size, weight = 900) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 12 && ctx.measureText(text).width > max) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

/**
 * Draws the results image on `canvas` (sized IMAGE_W × IMAGE_H).
 * t: the event; rows: resultRows(); vehicle: topVehicle().
 */
export async function drawResultImage(canvas, { t, rows = [], vehicle = null }) {
  canvas.width = IMAGE_W;
  canvas.height = IMAGE_H;
  const ctx = canvas.getContext("2d");
  const W = IMAGE_W;
  const H = IMAGE_H;

  // Background: charcoal with the logo's orange slashes.
  const bg = ctx.createRadialGradient(W / 2, H * 0.35, 80, W / 2, H * 0.4, H);
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
  slash(W * 0.72, 46, 0.9);
  slash(W * 0.72 + 64, 12, 0.6);
  slash(-W * 0.32, 22, 0.5);

  const [logo, ...flags] = await Promise.all([load("/overlay/potato-cup-logo.webp"), ...rows.map((r) => load(flagSrc(r.flag)))]);
  let y = 70;
  if (logo) {
    const lw = 760;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh + 40;
  }

  // Event name and line.
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  fit(ctx, t.name || "", W - 140, 60);
  ctx.fillText(t.name || "", W / 2, y + 50);
  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(infoLine(t), W / 2, y + 100);
  y += 150;

  // Champion card.
  const champ = rows[0];
  if (champ) {
    const x = 90;
    const w = W - 180;
    const h = 210;
    ctx.save();
    ctx.fillStyle = "rgba(251, 191, 36, 0.10)";
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 3;
    rounded(ctx, x, y, w, h, 28);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = "center";
    ctx.font = `800 28px ${FONT}`;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText("🏆  CHAMPION", W / 2, y + 52);
    const size = fit(ctx, champ.name, w - 200, 76);
    const nameW = ctx.measureText(champ.name).width;
    const flagW = flags[0] ? 64 : 0;
    const startX = W / 2 - (nameW + flagW + (flagW ? 20 : 0)) / 2;
    if (flags[0]) ctx.drawImage(flags[0], startX, y + 92, 64, 48);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.fillText(champ.name, startX + flagW + (flagW ? 20 : 0), y + 138);
    if (champ.prize || champ.points) {
      ctx.textAlign = "center";
      ctx.font = `700 26px ${FONT}`;
      ctx.fillStyle = "#fcd34d";
      ctx.fillText(rewardText(champ, true), W / 2, y + 186);
    }
    y += h + 36;
  }

  // The other places (2nd to 8th), sized to fit above the footer.
  const others = rows.slice(1, 8);
  const footH = vehicle ? 80 : 40;
  const gap = 12;
  const rowH = Math.min(74, Math.floor((H - footH - y - gap * Math.max(0, others.length - 1)) / Math.max(1, others.length)));
  const mid = rowH / 2;
  others.forEach((r, i) => {
    const top = y + i * (rowH + gap);
    const x = 90;
    const w = W - 180;
    ctx.fillStyle = "rgba(24, 29, 37, 0.94)";
    rounded(ctx, x, top, w, rowH, 16);
    ctx.fill();
    // Place badge.
    ctx.fillStyle = MEDAL[r.from] || "#334155";
    rounded(ctx, x + 18, top + mid - 22, 76, 44, 12);
    ctx.fill();
    ctx.fillStyle = MEDAL[r.from] ? "#0f172a" : "#e2e8f0";
    ctx.textAlign = "center";
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText(r.place, x + 56, top + mid + 9);
    const flag = flags[i + 1];
    if (flag) ctx.drawImage(flag, x + 116, top + mid - 15, 40, 30);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    fit(ctx, r.name, w - 470, 34, 800);
    ctx.fillText(r.name, x + 172, top + mid + 12);
    const reward = rewardText(r);
    if (reward) {
      ctx.textAlign = "right";
      ctx.font = `700 24px ${FONT}`;
      ctx.fillStyle = r.prize ? "#fcd34d" : "#94a3b8";
      ctx.fillText(reward, x + w - 24, top + mid + 9);
    }
  });

  // Footer: the vehicle played most.
  if (vehicle) {
    ctx.textAlign = "center";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillStyle = "#64748b";
    ctx.fillText(`Most played vehicle: ${vehicle.name} (${vehicle.count} ${vehicle.count === 1 ? "match" : "matches"})`, W / 2, H - 40);
  }
  return canvas;
}
