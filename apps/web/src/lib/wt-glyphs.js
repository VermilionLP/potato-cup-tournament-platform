// The marks War Thunder puts before some vehicle names ("▄JAS39C",
// "␗MiG-9"...): characters of its own font that the game and the War
// Thunder Wiki draw as small insignia (a roundel, the Balkenkreuz, the
// US star, the rising sun, a trophy...). Other fonts show them as plain
// box characters, so the site draws them itself: an SVG of the same
// insignia per character (drawn here, not the game's font), in the text
// colour. GlyphText.svelte renders any text with them; plainGlyphs() is
// for text that can't hold an icon (titles, toasts).
//
// The labels say what each mark is used for in the game's unit names
// (lang/units.csv): mostly the country a vehicle comes from or served in.

const r2 = (n) => Math.round(n * 100) / 100;

/** A 5-point star centred at (cx, cy) with outer radius r, as a path. */
function star(cx, cy, r, inner = 0.382, rot = -90) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${r2(cx + rr * Math.cos(a))} ${r2(cy + rr * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}
/** A regular polygon (n corners) centred at (cx, cy). */
function polygon(cx, cy, r, n, rot = -90) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180;
    pts.push(`${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const ring = (cx, cy, r, w) => circle(cx, cy, r) + circle(cx, cy, r - w);
const plus = (c, len, w) => `M${c - w / 2} ${c - len}h${w}v${len - w / 2}h${len - w / 2}v${w}h${-(len - w / 2)}v${len - w / 2}h${-w}v${-(len - w / 2)}h${-(len - w / 2)}v${-w}h${len - w / 2}Z`;

// The rays of a rising sun (half circle at the bottom).
const sunRays = (() => {
  const out = [];
  for (const deg of [-150, -120, -90, -60, -30]) {
    const a = (deg * Math.PI) / 180;
    const w = 0.16;
    const p = (r, d) => `${r2(12 + r * Math.cos(a + d))} ${r2(19 + r * Math.sin(a + d))}`;
    out.push(`M${p(7.2, -w / 2)}L${p(13, -w)}L${p(13, w)}L${p(7.2, w / 2)}Z`);
  }
  return out.join("");
})();

// The radiation trefoil: three 60° sectors around a dot.
const trefoil = (() => {
  let d = circle(12, 12, 2);
  for (const start of [-120, 0, 120]) {
    const a0 = ((start - 30 - 90) * Math.PI) / 180;
    const a1 = ((start + 30 - 90) * Math.PI) / 180;
    const pt = (r, a) => `${r2(12 + r * Math.cos(a))} ${r2(12 + r * Math.sin(a))}`;
    d += `M${pt(3.4, a0)}L${pt(10.5, a0)}A10.5 10.5 0 0 1 ${pt(10.5, a1)}L${pt(3.4, a1)}A3.4 3.4 0 0 0 ${pt(3.4, a0)}Z`;
  }
  return d;
})();

/**
 * Character → { label, d (filled path, even-odd), stroke? (stroked path) }.
 * The labels are the page's (translated there).
 */
export const WT_GLYPHS = {
  "▄": { label: "圆形机徽", d: ring(12, 12, 10.5, 2.6) + circle(12, 12, 4.6) }, // ▄ roundel: many countries
  "␗": { label: "中国", d: star(8, 11, 6.2) + star(15.5, 4.8, 1.9, 0.38, -55) + star(19, 8.8, 1.9, 0.38, -75) + star(19, 13.8, 1.9, 0.38, -95) + star(15.5, 17.8, 1.9, 0.38, -115) }, // ␗
  "◔": { label: "匈牙利", d: "M1 12L23 4.5V7L7.6 12L23 17V19.5Z M12.5 12L23 8.7V10.5L17.2 12L23 13.5V15.3Z" }, // ◔ chevron
  "▀": { label: "德国（缴获）", d: plus(12, 11, 9.6) + plus(12, 8.6, 5.6) + plus(12, 7.4, 3.6) }, // ▀ Balkenkreuz
  "◄": { label: "联邦德国", d: "M10.4 10.2L9.3 1.5H14.7L13.6 10.2Z M13.8 10.4L22.5 9.3V14.7L13.8 13.6Z M13.6 13.8L14.7 22.5H9.3L10.4 13.8Z M10.2 13.6L1.5 14.7V9.3L10.2 10.4Z" }, // ◄ Bundeswehr cross
  "▂": { label: "苏联", d: star(12, 12.8, 11) }, // ▂ red star
  "": { label: "以色列", stroke: "M12 2.2L21.2 18.1H2.8Z M12 21.8L2.8 5.9H21.2Z" }, // Star of David
  "◊": { label: "民主德国", d: "M12 1L23 12L12 23L1 12Z M12 4.2L4.2 12L12 19.8L19.8 12Z M12 8L16 12L12 16L8 12Z" }, // ◊ GDR
  "▅": { label: "日本", d: "M6 19A6 6 0 0 1 18 19Z M1 20.3H23V22H1Z" + sunRays }, // ▅ rising sun
  "▃": { label: "美国", d: circle(12, 12, 11) + star(12, 12.6, 8.6) }, // ▃ US star roundel
  "◘": { label: "荷兰（战后）", d: ring(12, 12, 11, 2.2) + ring(12, 12, 3.2, 1.6) + "M11.1 2H12.9V9H11.1Z M3.7 17.2L9.8 13.4L10.8 15L4.7 18.8Z M20.3 17.2L14.2 13.4L13.2 15L19.3 18.8Z" }, // ◘
  "◌": { label: "瑞士", d: circle(12, 12, 11) + plus(12, 7, 4.4) }, // ◌ Swiss cross
  "◢": { label: "挪威", d: ring(12, 12, 11, 2.2) + "M7 6.5L18.5 12L7 17.5Z M7 10.6H15V11.4H7Z M7 12.6H15V13.4H7Z" }, // ◢
  "◍": { label: "活动载具", d: "M6.5 16.5A4.5 4.5 0 0 1 6.9 7.6A6 6 0 0 1 18 8.3A4.1 4.1 0 0 1 18.3 16.5H15.6L16.8 14H13.6L15 10.5H11.6L9.5 16.5Z M11.4 14.8H13.8L11.2 22.5L16.6 15.5H14.3L15.8 12.3Z" }, // ◍ storm cloud
  "◥": { label: "印度尼西亚", d: polygon(12, 13, 11, 5) + polygon(12, 13, 7.4, 5) }, // ◥ pentagon
  "␙": { label: "杯赛奖励", d: "M6 2H18V3.6H22V7.5A4.6 4.6 0 0 1 17.4 12.1A6 6 0 0 1 13 15.6V18.5H17V22H7V18.5H11V15.6A6 6 0 0 1 6.6 12.1A4.6 4.6 0 0 1 2 7.5V3.6H6Z M3.8 5.4V7.5A2.8 2.8 0 0 0 6.1 10.2V5.4Z M20.2 5.4H17.9V10.2A2.8 2.8 0 0 0 20.2 7.5Z" }, // ␙ trophy
  "◐": { label: "希腊", d: "M2 2H22V22H2Z" + plus(12, 10, 4.4) }, // ◐ square with a cross
  "◗": { label: "荷兰（二战）", d: "M1.5 3H22.5L12 22Z M5.6 5.4L12 17.4L18.4 5.4Z" }, // ◗ triangle
  "○": { label: "特别涂装", d: "M12 2C6 2 2 6 2 11.3C2 14.6 3.6 17 6 18.4V21.5H9V19.6H10.5V21.5H13.5V19.6H15V21.5H18V18.4C20.4 17 22 14.6 22 11.3C22 6 18 2 12 2Z M8 9.8A2.6 2.6 0 1 1 8 15A2.6 2.6 0 1 1 8 9.8Z M16 9.8A2.6 2.6 0 1 1 16 15A2.6 2.6 0 1 1 16 9.8Z" }, // ○ skull
  "◆": { label: "特别载具", d: "M12 4L20 12L12 20L4 12Z" }, // ◆
  "␠": { label: "动物涂装", d: circle(12, 16, 5) + circle(4.6, 11.2, 2.1) + circle(8.7, 6.4, 2.3) + circle(15.3, 6.4, 2.3) + circle(19.4, 11.2, 2.1) }, // ␠ paw
  "⋠": { label: "特别载具", d: "M2 2H22V22H2Z M4 4V12H12V20H20V12H12V4Z" }, // ⋠ checker
  "◡": { label: "哥伦比亚", d: ring(12, 12, 11, 2.2) + ring(12, 12, 7, 2) + circle(12, 12, 2.6) }, // ◡ roundel
  "☢": { label: "连杀奖励", d: trefoil }, // ☢
};

const GLYPH_RE = new RegExp(`[${Object.keys(WT_GLYPHS).join("")}]`, "u");
const GLYPH_SPLIT = new RegExp(`([${Object.keys(WT_GLYPHS).join("")}])`, "u");

/** Whether a text has any of the marks. */
export const hasGlyphs = (text) => GLYPH_RE.test(String(text ?? ""));

/** The text in parts: [{ text } | { glyph, label, d, stroke }]. */
export function splitGlyphs(text) {
  const s = String(text ?? "");
  if (!GLYPH_RE.test(s)) return [{ text: s }];
  return s
    .split(GLYPH_SPLIT)
    .filter(Boolean)
    .map((part) => (WT_GLYPHS[part] ? { glyph: part, ...WT_GLYPHS[part] } : { text: part }));
}

/** The text without the marks (for titles, toasts, file names). */
export const plainGlyphs = (text) => String(text ?? "").replace(new RegExp(GLYPH_RE.source, "gu"), "");
