// Copies the site fonts out of node_modules into static/fonts/ (gitignored),
// so dev and build serve them as plain files.
//
// HarmonyOS Sans SC (Chinese and body text) comes pre-split into ~80 small
// files per weight with unicode-range rules, so a page only downloads the
// characters it shows. Its CSS is large (~130 KB a weight), so the site loads
// it as a separate, non-blocking stylesheet (src/app.html) instead of
// bundling it into the main CSS. Barlow / Barlow Condensed (headings and
// numbers) are small and imported in src/app.css.
//
//   node scripts/fonts.mjs        (run by `pnpm dev` and `pnpm build`)

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// 400 body, 500 / 700 emphasis, 900 big Chinese titles. 600 (font-semibold)
// falls back to 700.
const WEIGHTS = ['Regular', 'Medium', 'Bold', 'Black'];

// The package only exports dist/index.css; the per-weight files sit next to it.
const srcDir = path.dirname(require.resolve('harmonyos-sans-sc-webfont-splitted'));
const outDir = path.join(here, '..', 'static', 'fonts', 'harmonyos-sans-sc');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let css = '/* HarmonyOS Sans SC, Copyright Huawei Device Co., Ltd.; HarmonyOS Sans Fonts License Agreement. Split by cn-font-split. */\n';
let files = 0;
for (const weight of WEIGHTS) {
  const sheet = fs.readFileSync(path.join(srcDir, `${weight}.css`), 'utf8');
  // Drop the generator's header comment; the font-face rules point at
  // ./<Weight>_<hash>.woff2, which sit next to this CSS once copied.
  css += sheet.replace(/\/\*[\s\S]*?\*\//g, '').trim() + '\n';
  for (const name of fs.readdirSync(srcDir)) {
    if (name.startsWith(`${weight}_`) && name.endsWith('.woff2')) {
      fs.copyFileSync(path.join(srcDir, name), path.join(outDir, name));
      files += 1;
    }
  }
}
fs.writeFileSync(path.join(outDir, 'fonts.css'), css);
console.log(`fonts: HarmonyOS Sans SC ${WEIGHTS.join(' / ')} -> static/fonts (${files} files)`);
