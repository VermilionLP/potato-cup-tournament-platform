#!/usr/bin/env node
// Builds apps/web/static/wt-units.json: War Thunder vehicle names (English
// and Chinese shop / full names) -> unit ids, for the vehicle pool pictures
// (images on the War Thunder wiki are named by unit id). Source: units.csv
// of the War Thunder datamine (github.com/gszabi99/War-Thunder-Datamine,
// lang.vromfs.bin_u/lang/units.csv). Run after big game updates:
//   node tools/wt-units/build-index.mjs path/to/units.csv
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { looseName } from '../../apps/web/src/lib/wt-units.js';

const [csvPath] = process.argv.slice(2);
if (!csvPath) {
  console.error('usage: node tools/wt-units/build-index.mjs path/to/units.csv');
  process.exit(1);
}

// Minimal CSV for this file: ; separated, "quoted", "" escapes.
function parseLine(line) {
  const out = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let v = '';
      i += 1;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { v += '"'; i += 2; }
        else if (line[i] === '"') { i += 1; break; }
        else v += line[i++];
      }
      out.push(v);
      i += 1; // ;
    } else {
      const j = line.indexOf(';', i);
      out.push(line.slice(i, j < 0 ? line.length : j));
      i = j < 0 ? line.length + 1 : j + 1;
    }
  }
  return out;
}

const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/);
const head = parseLine(lines[0]);
const EN = head.indexOf('<English>');
const ZH = head.indexOf('<Chinese>');
const names = new Map();
for (const line of lines.slice(1)) {
  if (!line) continue;
  const row = parseLine(line);
  const m = /^(.+)_(shop|0|1)$/.exec(row[0] || '');
  if (!m) continue;
  for (const col of [EN, ZH]) {
    const key = looseName(row[col] || '');
    if (!key) continue;
    if (!names.has(key)) names.set(key, new Set());
    names.get(key).add(m[1]);
  }
}
// Names our pool templates spell differently from the game.
const ALIASES = {
  'Me 262 A-1a/U4': 'me-262a-1a_u4',
  'Fiat G.91 R/4': 'fiat_g91_r4',
  'Meteor F Mk 9': 'meteor_frmk9_iaf',
  'F/A-18A Late': 'fa_18a_hug_2_raaf',
  'F/A-18F Block 2': 'fa_18f_block_2_raaf',
  'P-51C-10-NT': 'p-51c-10-nt',
  'Yak-3 (Eremin)': 'yak-3_eremin',
  'Spitfire Mk XVI': 'spitfire_xvi',
  'Ki-61-Ia Otsu': 'ki_61_1a_otsu',
  'G.55 Serie 0': 'g_55_serie1_ss0',
  // The German tree's E-7 is the E-7/U2; the plain name is Japan's copy.
  'Bf 109 E-7': 'bf-109e-7',
};
for (const [name, id] of Object.entries(ALIASES)) names.set(looseName(name), new Set([id]));

const out = {};
for (const [key, ids] of [...names].sort((a, b) => a[0].localeCompare(b[0]))) {
  const list = [...ids].sort();
  out[key] = list.length === 1 ? list[0] : list;
}
const target = join(dirname(fileURLToPath(import.meta.url)), '../../apps/web/static/wt-units.json');
writeFileSync(target, JSON.stringify({ source: 'War-Thunder-Datamine lang/units.csv', names: out }));
console.log(`${Object.keys(out).length} names -> ${target}`);
