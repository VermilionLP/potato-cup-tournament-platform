// Post-build step for older Chromium-based phone browsers, notably Huawei
// Browser on HarmonyOS 2-4 (Chromium 99-era kernels): Tailwind v4 writes
// colours as oklch() (Chromium 111+) and moves elements with the individual
// `translate` / `scale` / `rotate` properties (Chromium 104+). In those
// browsers every colour of the site was missing and icons sat off-centre.
//
// This rewrites the built CSS: oklch() colours become sRGB hex (the same
// colours in modern browsers), and each translate / scale / rotate rule
// gets a `transform` fallback that only applies where those properties are
// unsupported. The .br / .gz copies are rewritten too.
//
//   node scripts/legacy-css.mjs [buildDir]     (run by `pnpm build`)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// --- oklch -> sRGB hex -------------------------------------------------------

const num = (s, percentScale = 1) => (String(s).endsWith('%') ? (parseFloat(s) / 100) * percentScale : parseFloat(s));

function oklchToRgb(l, c, h) {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  // OKLab -> linear sRGB (Björn Ottosson)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return lin.map(gamma).map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255));
}

const hex2 = (n) => n.toString(16).padStart(2, '0');

function parseOklch(inner) {
  const [main, alphaPart] = inner.split('/');
  const parts = main.trim().split(/[\s,]+/);
  if (parts.length !== 3 || parts.some((p) => !/^-?[\d.]+%?(deg)?$/.test(p) && p !== 'none')) return null;
  const [L, C, H] = parts.map((p) => (p === 'none' ? '0' : p));
  const alpha = alphaPart === undefined ? 1 : num(alphaPart.trim());
  const v = [num(L), num(C, 0.4), parseFloat(H), alpha];
  return v.every(Number.isFinite) ? { rgb: oklchToRgb(v[0], v[1], v[2]), alpha } : null;
}

/**
 * oklch(L C H [/ A]) -> hex; anything it can't read is left as it was.
 * Opaque theme variables (`--primary:oklch(...)`) also get `--primary-rgb:R G B`
 * so opacity utilities can fall back without color-mix() (see below).
 */
export function convertOklch(css) {
  const toHex = (inner) => {
    const c = parseOklch(inner);
    if (!c) return null;
    return `#${c.rgb.map(hex2).join('')}${c.alpha >= 1 ? '' : hex2(Math.round(Math.min(1, Math.max(0, c.alpha)) * 255))}`;
  };
  return css
    .replace(/(^|[;{\s])(--(?!color-|tw-)[\w-]+):\s*oklch\(\s*([^)]*?)\s*\)/g, (whole, pre, name, inner) => {
      const c = parseOklch(inner);
      if (!c) return whole;
      const value = toHex(inner);
      return c.alpha >= 1 ? `${pre}${name}:${value};${name}-rgb:${c.rgb.join(' ')}` : `${pre}${name}:${value}`;
    })
    .replace(/oklch\(\s*([^)]*?)\s*\)/gi, (whole, inner) => toHex(inner) ?? whole);
}

/**
 * Tailwind writes `bg-primary/10` as a solid `var(--primary)` fallback plus a
 * color-mix() version inside @supports. Browsers without color-mix()
 * (Chromium < 111) got the full-strength colour; give them
 * rgb(var(--primary-rgb) / 0.1) instead when the variable has an -rgb twin.
 */
export function opacityFallbacks(css) {
  const rgbVars = new Set([...css.matchAll(/(--[\w-]+)-rgb:/g)].map((m) => m[1]));
  // The minifier may merge the fallback into a selector list
  // (`.bg-background,.bg-background\/25{...}`): then the list keeps its rule and
  // the opacity version is added for the one selector right after it.
  const block = /(?<=^|[{}])([^{}]+)\{([^{}]*)\}(@supports \(color:\s*color-mix\(in lab,\s*red,\s*red\)\)\s*\{)([^{}]+)\{([^{}]*)\}\}/g;
  return css.replace(block, (whole, list, fallback, supports, selector, modern) => {
    const sameRule = list === selector;
    if (!sameRule && !list.split(',').includes(selector)) return whole;
    let decls = fallback;
    for (const m of modern.matchAll(/([\w-]+):[^;]*?color-mix\(in oklab,\s*var\((--[\w-]+)\)\s*([\d.]+)%,\s*transparent\)/g)) {
      const [, prop, name, pct] = m;
      if (!rgbVars.has(name)) continue;
      const alpha = +(Number(pct) / 100).toFixed(4);
      decls = decls.split(`${prop}:var(${name})`).join(`${prop}:rgb(var(${name}-rgb) / ${alpha})`);
    }
    if (decls === fallback) return whole;
    const fallbackRules = sameRule ? `${list}{${decls}}` : `${list}{${fallback}}${selector}{${decls}}`;
    return `${fallbackRules}${supports}${selector}{${modern}}}`;
  });
}

// --- translate / scale / rotate fallbacks ------------------------------------

const TRANSFORMS = [
  { re: /(?:^|;)translate:([^;}]+)/, prop: 'translate', fn: (v) => `translate(${v.trim().split(/\s+/).join(',')})` },
  { re: /(?:^|;)scale:([^;}]+)/, prop: 'scale', fn: (v) => `scale(${v.trim().split(/\s+/).join(',')})` },
  { re: /(?:^|;)rotate:([^;}]+)/, prop: 'rotate', fn: (v) => `rotate(${v.trim()})` },
];

/** `@supports not (translate: 0)` rules giving each such rule a transform. */
export function transformFallbacks(css) {
  const out = { translate: [], scale: [], rotate: [] };
  // Plain rules only (selector{decls}); good enough for minified output.
  for (const m of css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = m;
    for (const t of TRANSFORMS) {
      const d = t.re.exec(body);
      if (d && !/^\s*(none|initial|inherit|unset)\s*$/.test(d[1])) out[t.prop].push(`${selector.trim()}{transform:${t.fn(d[1])}}`);
    }
  }
  return Object.entries(out)
    .filter(([, rules]) => rules.length)
    .map(([prop, rules]) => `@supports not (${prop}:0){${rules.join('')}}`)
    .join('');
}

export function legacyCss(css) {
  const converted = opacityFallbacks(convertOklch(css));
  return converted + transformFallbacks(converted);
}

// --- build step --------------------------------------------------------------

function cssFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...cssFiles(p));
    else if (entry.name.endsWith('.css')) files.push(p);
  }
  return files;
}

function run(buildDir) {
  let changed = 0;
  for (const file of cssFiles(buildDir)) {
    const before = fs.readFileSync(file, 'utf8');
    const after = legacyCss(before);
    if (after === before) continue;
    fs.writeFileSync(file, after);
    if (fs.existsSync(`${file}.gz`)) fs.writeFileSync(`${file}.gz`, zlib.gzipSync(after, { level: 9 }));
    if (fs.existsSync(`${file}.br`)) {
      fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(after, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
    }
    changed += 1;
  }
  console.log(`legacy-css: ${changed} stylesheet(s) rewritten for older browsers`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  run(path.resolve(process.argv[2] || path.join(here, '..', 'build')));
}
