#!/usr/bin/env node
// Builds the Windows program: panel.mjs (with engine.mjs, config.mjs,
// detect.mjs and panel.html inlined) bundled by esbuild into one CommonJS
// file, then packed with Node.js 22 into a single .exe by pkg (no Node.js
// needed on the streaming PC). Works on Linux and Windows; the build tools
// are installed into .build-tools/ on first use.
//
//   node tools/wt-autoscene/build-exe.mjs [--version 2026.11.13] [--out dist]
//
// .github/workflows/autoscene-exe.yml runs it on every change and publishes
// the result as the "autoscene" release.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    version: { type: 'string', default: new Date().toISOString().slice(0, 10).replaceAll('-', '.') },
    out: { type: 'string', default: join(here, 'dist') },
  },
});

const TOOLS = { esbuild: '0.28.2', '@yao-pkg/pkg': '6.25.0' };
const NODE_TARGET = 'node22-win-x64';
export const EXE_NAME = 'PotatoCup-AutoScene.exe';

const toolsDir = join(here, '.build-tools');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const need = Object.entries(TOOLS).filter(([name, v]) => {
  try {
    return JSON.parse(readFileSync(join(toolsDir, 'node_modules', name, 'package.json'), 'utf8')).version !== v;
  } catch {
    return true;
  }
});
if (need.length) {
  mkdirSync(toolsDir, { recursive: true });
  if (!existsSync(join(toolsDir, 'package.json'))) writeFileSync(join(toolsDir, 'package.json'), '{ "private": true }\n');
  console.log(`installing ${need.map(([n, v]) => `${n}@${v}`).join(', ')}`);
  execFileSync(npm, ['install', '--no-audit', '--no-fund', '--prefix', toolsDir, ...need.map(([n, v]) => `${n}@${v}`)], { stdio: 'inherit', shell: process.platform === 'win32' });
}
const require = createRequire(join(toolsDir, 'package.json'));
const esbuild = require('esbuild');

const out = resolve(args.out);
mkdirSync(out, { recursive: true });
const bundle = join(out, 'panel.cjs');

await esbuild.build({
  entryPoints: [join(here, 'panel.mjs')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: bundle,
  logLevel: 'warning',
  // import.meta.url is only used outside the .exe (process.pkg is set inside).
  logOverride: { 'empty-import-meta': 'silent' },
  define: {
    __PANEL_HTML__: JSON.stringify(readFileSync(join(here, 'panel.html'), 'utf8')),
    __VERSION__: JSON.stringify(args.version),
  },
  banner: { js: `// Potato Cup auto scene panel ${args.version} (built from tools/wt-autoscene)` },
});

const exe = join(out, EXE_NAME);
const pkgBin = join(toolsDir, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
execFileSync(process.execPath, [pkgBin, bundle, '--targets', NODE_TARGET, '--output', exe, '--compress', 'GZip', '--no-bytecode', '--public'], { stdio: 'inherit' });
console.log(`built ${exe} (${(statSync(exe).size / 1e6).toFixed(1)} MB), version ${args.version}`);
