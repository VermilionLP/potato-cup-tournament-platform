// Paints a bracketImageLayout() (#lib/bracket-image.js) on a canvas, in the
// site's light theme: the black top bar with the wordmark, the event title
// in Barlow Condensed, white cards with the match number strip, flags,
// winners in bold, connectors orange once decided. Uses the page's own
// fonts (HarmonyOS Sans SC is split by unicode-range, so the characters of
// the picture are loaded first) and the site's flag SVGs.

import { CARD_H, CARD_W, ROW_H, STRIP_H } from "./bracket-image.js";
import { flagSrc } from "./flags.js";

const C = {
  page: "#f7f7f5", card: "#ffffff", ink: "#14161b", muted: "#5b6170", faint: "#8b95a5", border: "#e5e5e2", soft: "#f1f1ee",
  bar: "#0b0d12", orange: "#f97316", orangeInk: "#c2410c", orangeSoft: "#ffedd5", win: "#166534", winSoft: "#dcfce7",
  line: "#d4d4cf", live: "#dc2626", prize: "#b45309", prizeSoft: "#fef3c7",
};
const SANS = '"HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const DISPLAY = '"Barlow Condensed", "HarmonyOS Sans SC", sans-serif';
const font = (weight, size, family = SANS) => `${weight} ${size}px ${family}`;
// Words the painter adds itself (the picture is in Chinese, like the site's
// default), loaded with the rest.
const CHAMPION = "冠军 CHAMPION";
const LIVE = "● 进行中";
const MADE_AT = "生成于";
const FIXED_TEXT = [CHAMPION, LIVE, MADE_AT, "BRACKET Potato Cup 0123456789:/ ·"];

/** Every font + text the picture uses, so the split web fonts are loaded before painting. */
function textRuns(layout) {
  const all = [
    layout.header.name, layout.header.kind, layout.header.note, layout.header.time, ...layout.header.tags, layout.header.champion?.name,
    ...layout.cards.flatMap((c) => [String(c.number ?? ""), ...c.rows.flatMap((r) => [r.name, r.score])]),
    ...layout.labels.map((l) => l.text), ...layout.titles.flatMap((t) => [t.text, t.sub]), ...layout.notes.map((n) => n.text),
    ...layout.groups.flatMap((g) => [g.text, g.sub]), ...layout.cards.map((c) => c.byeNote),
    ...layout.tables.flatMap((tb) => [tb.note, ...tb.head.map(([h]) => h), ...tb.rows.flatMap((r) => [...r.cells, r.mark])]),
    ...FIXED_TEXT,
  ].filter(Boolean).join("");
  return all;
}

async function loadFonts(layout) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const text = textRuns(layout);
  await Promise.all([
    document.fonts.load(font(400, 16), text),
    document.fonts.load(font(700, 16), text),
    document.fonts.load(font(800, 16, DISPLAY), text.toUpperCase()),
    document.fonts.load(font(600, 16, DISPLAY), text),
  ]).catch(() => {});
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text cut with "…" to fit `max` px. */
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function pill(ctx, x, y, text, [bg, fg], { size = 13, weight = 700, padX = 9, h = 24 } = {}) {
  ctx.font = font(weight, size);
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 7);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  return w;
}

/**
 * The picture as a PNG blob. `scale`: pixel density (2 for phones), lowered
 * for very large brackets so the canvas stays within browser limits.
 */
export async function drawBracketImage(layout, { scale = 2, host = typeof location !== "undefined" ? location.host : "" } = {}) {
  await loadFonts(layout);
  const limit = 12000;
  const s = Math.max(0.75, Math.min(scale, limit / layout.width, limit / layout.height));
  const flagImages = new Map(await Promise.all(layout.flags.map(async (code) => [code, await loadImage(flagSrc(code))])));
  const wordmark = await loadImage("/logo-wordmark-64.webp");

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.width * s);
  canvas.height = Math.round(layout.height * s);
  const ctx = canvas.getContext("2d");
  ctx.scale(s, s);
  ctx.textBaseline = "middle";

  // Page
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // Top bar
  ctx.fillStyle = C.bar;
  ctx.fillRect(0, 0, layout.width, 56);
  if (wordmark) ctx.drawImage(wordmark, 40, 12, 129, 32);
  else {
    ctx.fillStyle = "#fff";
    ctx.font = font(800, 26, DISPLAY);
    ctx.fillText("POTATO CUP", 40, 29);
  }
  ctx.font = font(600, 20, DISPLAY);
  ctx.fillStyle = C.orange;
  ctx.textAlign = "right";
  ctx.fillText("BRACKET", layout.width - 40, 29);
  ctx.textAlign = "left";

  // Title block
  const h = layout.header;
  let x = 40;
  x += pill(ctx, x, 76, h.kind, [C.orangeSoft, "#9a3412"]) + 8;
  if (h.time) {
    ctx.font = font(400, 14);
    ctx.fillStyle = C.muted;
    ctx.fillText(h.time, x + 2, 89);
  }
  ctx.font = font(800, 44, DISPLAY);
  ctx.fillStyle = C.ink;
  const champW = h.champion ? 280 : 0;
  ctx.fillText(fit(ctx, h.name.toUpperCase(), layout.width - 80 - champW), 40, 128);
  x = 40;
  for (const tag of h.tags) x += pill(ctx, x, 152, tag, [C.soft, "#3f4451"], { size: 12, h: 22 }) + 6;
  if (h.note) {
    ctx.font = font(400, 13);
    ctx.fillStyle = C.faint;
    ctx.fillText(h.note, x + 6, 163);
  }
  // Champion
  if (h.champion) {
    const w = 250;
    const cx = layout.width - 40 - w;
    ctx.fillStyle = C.prizeSoft;
    roundRect(ctx, cx, 86, w, 70, 14);
    ctx.fill();
    ctx.font = font(700, 13);
    ctx.fillStyle = C.prize;
    ctx.fillText(CHAMPION, cx + 16, 106);
    const flag = flagImages.get(h.champion.flag);
    let nx = cx + 16;
    if (flag) {
      ctx.drawImage(flag, nx, 122, 28, 21);
      nx += 36;
    }
    ctx.font = font(800, 28, DISPLAY);
    ctx.fillStyle = C.ink;
    ctx.fillText(fit(ctx, h.champion.name, cx + w - 16 - nx), nx, 134);
  }
  ctx.fillStyle = C.border;
  ctx.fillRect(40, 186, layout.width - 80, 1);

  // Section titles (双败: 胜者组 / 败者组)
  for (const t of layout.titles) {
    ctx.fillStyle = C.orange;
    roundRect(ctx, t.x, t.y + 10, 4, 20, 2);
    ctx.fill();
    ctx.font = font(700, 20);
    ctx.fillStyle = C.ink;
    ctx.fillText(t.text, t.x + 14, t.y + 21);
    if (t.sub) {
      const w = ctx.measureText(t.text).width;
      ctx.font = font(400, 13);
      ctx.fillStyle = C.faint;
      ctx.fillText(t.sub, t.x + 26 + w, t.y + 22);
    }
  }

  // Group titles (小组赛: A 组, B 组…)
  for (const g of layout.groups) {
    ctx.fillStyle = C.orange;
    roundRect(ctx, g.x, g.y + 8, 34, 34, 9);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = font(800, 22, DISPLAY);
    ctx.textAlign = "center";
    ctx.fillText(g.text.replace(/\s*组$/, ""), g.x + 17, g.y + 26);
    ctx.textAlign = "left";
    ctx.font = font(700, 24);
    ctx.fillStyle = C.ink;
    ctx.fillText(g.text, g.x + 46, g.y + 26);
    if (g.sub) {
      const w = ctx.measureText(g.text).width;
      ctx.font = font(400, 14);
      ctx.fillStyle = C.faint;
      ctx.fillText(g.sub, g.x + 58 + w, g.y + 27);
    }
  }

  // Tables (standings, placings)
  for (const tb of layout.tables) {
    ctx.fillStyle = C.card;
    roundRect(ctx, tb.x, tb.y, tb.width, tb.height, 12);
    ctx.fill();
    ctx.save();
    roundRect(ctx, tb.x, tb.y, tb.width, tb.height, 12);
    ctx.clip();
    ctx.fillStyle = C.soft;
    ctx.fillRect(tb.x, tb.y, tb.width, 32);
    let cx = tb.x;
    ctx.font = font(700, 12);
    ctx.fillStyle = C.muted;
    for (const [h, w, align] of tb.head) {
      ctx.textAlign = align === "center" ? "center" : "left";
      ctx.fillText(h, align === "center" ? cx + w / 2 : cx + 12, tb.y + 17);
      cx += w;
    }
    ctx.textAlign = "left";
    tb.rows.forEach((r, i) => {
      const ry = tb.y + 32 + i * ROW_H;
      const mid = ry + ROW_H / 2 + 1;
      if (r.good) {
        ctx.fillStyle = "#f0fdf4";
        ctx.fillRect(tb.x, ry, tb.width, ROW_H);
      }
      ctx.fillStyle = C.border;
      ctx.fillRect(tb.x, ry, tb.width, 1);
      let x = tb.x;
      r.cells.forEach((cell, j) => {
        const [, w, align] = tb.head[j];
        if (j === 0) {
          ctx.font = font(800, 17, DISPLAY);
          ctx.fillStyle = r.mark === "冠军" ? C.prize : C.orangeInk;
          ctx.textAlign = "center";
          ctx.fillText(cell, x + w / 2, mid);
          ctx.textAlign = "left";
        } else if (j === 1) {
          let nx = x + 12;
          const flag = flagImages.get(r.flag);
          if (flag) {
            ctx.drawImage(flag, nx, mid - 7, 19, 14);
            nx += 26;
          }
          ctx.font = font(700, 14);
          ctx.fillStyle = C.ink;
          const name = fit(ctx, cell, w - (nx - x) - (r.mark ? 56 : 12));
          ctx.fillText(name, nx, mid);
          if (r.mark) {
            const tone = r.mark === "晋级" ? [C.winSoft, C.win] : r.mark === "冠军" ? [C.prizeSoft, C.prize] : [C.soft, C.muted];
            pill(ctx, nx + ctx.measureText(name).width + 8, mid - 10, r.mark, tone, { size: 11, padX: 6, h: 20 });
            ctx.textBaseline = "middle";
          }
        } else {
          const strong = tb.head[j][0] === "积分" || cell === "出线";
          ctx.font = strong ? font(700, 14) : font(400, 14);
          ctx.fillStyle = cell === "出线" ? C.win : C.ink;
          ctx.textAlign = align === "center" ? "center" : "left";
          ctx.fillText(cell, align === "center" ? x + w / 2 : x + 12, mid);
          ctx.textAlign = "left";
        }
        x += w;
      });
      if (r.cut) {
        ctx.strokeStyle = "#22c55e";
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tb.x, ry + ROW_H);
        ctx.lineTo(tb.x + tb.width, ry + ROW_H);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    ctx.restore();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    roundRect(ctx, tb.x, tb.y, tb.width, tb.height, 12);
    ctx.stroke();
    if (tb.note) {
      ctx.font = font(400, 13);
      ctx.fillStyle = C.faint;
      ctx.fillText(tb.note, tb.x + 2, tb.y + tb.height + 16);
    }
  }

  // Column labels
  ctx.font = font(700, 13);
  for (const l of layout.labels) {
    ctx.fillStyle = C.muted;
    ctx.fillText(l.text, l.x + 2, l.y + 12);
  }

  // Connectors under the cards
  ctx.lineJoin = "round";
  for (const l of layout.links) {
    ctx.strokeStyle = l.done ? "#fdba74" : C.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    l.points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }

  // Notes (三四名决赛)
  ctx.font = font(700, 13);
  ctx.fillStyle = C.muted;
  for (const n of layout.notes) ctx.fillText(n.text, n.x + 2, n.y - 6);

  // Cards
  const rowH = (CARD_H - STRIP_H) / 2;
  for (const c of layout.cards) {
    if (c.byeNote) {
      // Swiss bye: a dashed note card.
      ctx.strokeStyle = "#cfcfca";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      roundRect(ctx, c.x, c.y, CARD_W, CARD_H, 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = font(400, 13);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      ctx.fillText(fit(ctx, c.byeNote, CARD_W - 20), c.x + CARD_W / 2, c.y + CARD_H / 2);
      ctx.textAlign = "left";
      continue;
    }
    ctx.fillStyle = C.card;
    roundRect(ctx, c.x, c.y, CARD_W, CARD_H, 10);
    ctx.fill();
    // Everything inside the card is clipped to its rounded shape.
    ctx.save();
    roundRect(ctx, c.x, c.y, CARD_W, CARD_H, 10);
    ctx.clip();
    ctx.fillStyle = C.soft;
    ctx.fillRect(c.x, c.y, CARD_W, STRIP_H);
    ctx.font = font(700, 11);
    ctx.fillStyle = C.faint;
    ctx.fillText(c.number ? `#${c.number}` : "", c.x + 9, c.y + STRIP_H / 2 + 1);
    if (c.live) {
      ctx.fillStyle = C.live;
      ctx.textAlign = "right";
      ctx.fillText(LIVE, c.x + CARD_W - 9, c.y + STRIP_H / 2 + 1);
      ctx.textAlign = "left";
    }
    c.rows.forEach((r, i) => {
      const ry = c.y + STRIP_H + i * rowH;
      const mid = ry + rowH / 2 + 1;
      if (r.won) {
        ctx.fillStyle = "#fff7ed";
        ctx.fillRect(c.x, ry, CARD_W, rowH);
      }
      let nx = c.x + 10;
      const flag = flagImages.get(r.flag);
      if (flag) {
        ctx.drawImage(flag, nx, mid - 7, 19, 14);
        nx += 25;
      }
      const sw = 32;
      if (r.score !== "") {
        ctx.fillStyle = r.won ? C.orange : C.soft;
        ctx.fillRect(c.x + CARD_W - sw, ry, sw, rowH);
        ctx.font = font(r.won ? 800 : 600, 17, DISPLAY);
        ctx.fillStyle = r.won ? "#ffffff" : C.muted;
        ctx.textAlign = "center";
        ctx.fillText(r.score, c.x + CARD_W - sw / 2, mid);
        ctx.textAlign = "left";
      }
      ctx.font = font(r.won ? 700 : 400, 14);
      ctx.fillStyle = r.empty || r.lost ? C.faint : C.ink;
      ctx.fillText(fit(ctx, r.name, c.x + CARD_W - sw - 8 - nx), nx, mid);
    });
    ctx.fillStyle = C.border;
    ctx.fillRect(c.x, c.y + STRIP_H, CARD_W, 1);
    ctx.fillRect(c.x, c.y + STRIP_H + rowH, CARD_W, 1);
    ctx.restore();
    // The border on top.
    ctx.strokeStyle = c.live ? C.orange : C.border;
    ctx.lineWidth = c.live ? 2 : 1;
    roundRect(ctx, c.x, c.y, CARD_W, CARD_H, 10);
    ctx.stroke();
  }

  // Footer
  const fy = layout.height - 52;
  ctx.fillStyle = C.card;
  ctx.fillRect(0, fy, layout.width, 52);
  ctx.fillStyle = C.border;
  ctx.fillRect(0, fy, layout.width, 1);
  ctx.font = font(700, 14);
  ctx.fillStyle = C.ink;
  ctx.fillText(host, 40, fy + 27);
  const d = layout.stamp;
  const pad = (v) => String(v).padStart(2, "0");
  ctx.font = font(400, 13);
  ctx.fillStyle = C.faint;
  ctx.textAlign = "right";
  ctx.fillText(`${MADE_AT} ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())} · Potato Cup`, layout.width - 40, fy + 27);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("图片生成失败"))), "image/png"));
}
