// War Thunder unit ids for pool vehicles, filled in on the server so event
// pages don't download the name index. The index is the web app's
// static/wt-units.json (tools/wt-units/build-index.mjs) and the lookup is
// the web app's own $lib/wt-units.js (pure, no imports), so both sides pick
// the same unit. WT_UNITS_FILE overrides the index path.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unitIdOf } from '../../web/src/lib/wt-units.js';

const DEFAULT_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'static', 'wt-units.json');
let index = null;

/** The name index, read once ({ names: {} } when the file is missing). */
export function unitIndex(file = process.env.WT_UNITS_FILE || DEFAULT_FILE) {
  if (!index) {
    try {
      index = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      index = { names: {} };
    }
  }
  return index;
}

/** The template with `unit` (wiki unit id or null) on every vehicle. */
export function withUnits(template, idx = unitIndex()) {
  if (!template) return template;
  return { ...template, vehicles: (template.vehicles || []).map((v) => ({ ...v, unit: unitIdOf(v, idx) })) };
}
