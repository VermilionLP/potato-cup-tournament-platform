// Vehicle specifications for the Ban / Pick overlay's reveal: read from the
// War Thunder wiki's unit page (wiki.warthunder.com/unit/<unit>), kept on
// disk as JSON and refreshed after a week. A page that can't be read is
// retried after an hour; an old copy is served meanwhile.
//
// The page is server-rendered: each spec is a .game-unit_chars-block with a
// header and a value. Flight figures carry four values (RB / AB, upgraded /
// stock): the upgraded RB and AB ones are kept. Engine and weapon details
// sit in data-feature-popover attributes (HTML inside the attribute).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

export const WIKI_UNIT = 'https://wiki.warthunder.com/unit';
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_MS = 60 * 60 * 1000;
const MAX_BYTES = 3 * 1024 * 1024;
// Bumped when the parsed shape changes, so old cached files are read again.
export const SPECS_VERSION = 1;

export const defaultSpecsDir = () =>
  process.env.VEHICLE_SPECS_CACHE || join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'vehicle-specs');

/** A wiki unit id ("f_16a_block_10", "bf-109f-4"), or null. */
export function unitId(value) {
  const id = String(value || '');
  return /^[a-z0-9][a-z0-9_.-]{0,80}$/i.test(id) && !id.includes('..') ? id : null;
}

const clean = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const text = (el) => (el ? clean(el.textContent) : '');

// "2,156 km/h" from a value cell with the four mode variants; the plain text
// when it has none.
function modeValues(valueEl) {
  if (!valueEl) return { value: '' };
  const pick = (cls) => valueEl.querySelector(`.${cls}`);
  const rb = pick('show-char-rb-mod-ref');
  const ab = pick('show-char-ab-mod-ref');
  if (!rb && !ab) return { value: text(valueEl) };
  // The unit is the text after the variants ("km/h").
  const unit = clean(valueEl.childNodes.filter((n) => n.nodeType === 3).map((n) => n.rawText).join(' '));
  const withUnit = (el) => (el ? clean(`${text(el)} ${unit}`) : '');
  return { value: withUnit(rb || ab), value_ab: withUnit(ab || rb) };
}

/** The label → value rows of a list of .game-unit_chars-line elements (popovers). */
function popoverRows(htmlText) {
  if (!htmlText) return { title: '', rows: [] };
  const root = parse(htmlText);
  const title = text(root.querySelector('.game-unit_popover-header span'));
  const rows = [];
  let section = '';
  for (const el of root.querySelectorAll('.game-unit_chars-line, .form-text')) {
    if (el.classList.contains('form-text')) {
      section = text(el);
      continue;
    }
    const label = text(el.querySelector('.game-unit_chars-header'));
    const value = text(el.querySelector('.game-unit_chars-value'));
    if (label) rows.push({ label, value, ...(section ? { section } : {}) });
  }
  return { title, rows };
}

/** Rows of a .game-unit_chars container: { label, value, value_ab?, info?, sub? }. */
function charsRows(container) {
  const rows = [];
  for (const block of container?.querySelectorAll('.game-unit_chars-block') || []) {
    const line = block.querySelector('.game-unit_chars-line');
    const label = text(line?.querySelector('.game-unit_chars-header'));
    if (!label) continue;
    const info = text(line.querySelector('.game-unit_chars-info'));
    const sub = block.querySelector('.game-unit_chars-subline');
    const valueEl = line.querySelector('.game-unit_chars-value') || sub?.querySelector('.game-unit_chars-value');
    const row = { label, ...modeValues(valueEl) };
    if (info) row.info = info;
    // "at 10,973 m" next to the max speed.
    const subText = sub ? text(sub.querySelector('span:not(.game-unit_chars-value)')) : '';
    if (subText) row.sub = subText;
    // A popover with details (the engine).
    const pop = valueEl?.querySelector('[data-feature-popover]');
    if (pop) row.details = popoverRows(pop.getAttribute('data-feature-popover')).rows;
    rows.push(row);
  }
  return rows;
}

function blockByHeader(root, header) {
  return root.querySelectorAll('.block').find((b) => text(b.querySelector('.block-header')) === header) || null;
}

/** "2 × 7.92 mm MG 17 machine gun" -> { name, count: 2 }. */
function weaponTitle(s) {
  const m = /^(\d+)\s*[×x]\s*(.+)$/.exec(clean(s));
  return m ? { name: m[2], count: Number(m[1]) } : { name: clean(s), count: 1 };
}

/**
 * The vehicle's specifications from a wiki unit page, or null when the page
 * isn't one (no name).
 */
export function parseUnitPage(html, unit = null) {
  const root = parse(String(html || ''));
  const name = text(root.querySelector('.game-unit_name'));
  if (!name) return null;

  const rank = text(root.querySelector('.game-unit_rank .game-unit_card-info_value'));
  const features = root.querySelectorAll('.game-unit_feature span').map(text).filter(Boolean);
  const flight = charsRows(blockByHeader(root, 'Flight performance')?.querySelector('.game-unit_chars'));
  const general = charsRows(blockByHeader(root, 'General characteristics'));

  // Fixed guns (the first preset: the default loadout).
  const offensive = blockByHeader(root, 'Offensive armament');
  const preset = offensive?.querySelector('.tab-pane') || offensive;
  const guns = (preset?.querySelectorAll('.game-unit_weapon') || []).map((w) => {
    const rows = charsRows(w.querySelector('.game-unit_chars'));
    const get = (label) => rows.find((r) => r.label === label)?.value || '';
    return { ...weaponTitle(text(w.querySelector('.game-unit_weapon-title'))), ammo: get('Ammunition'), rate: get('Fire rate') };
  });

  // Suspended weapons: the slot list, with each weapon's popover figures
  // and how many pylons take it.
  const suspendedBlock = blockByHeader(root, 'Suspended armament');
  const suspended = (suspendedBlock?.querySelectorAll('.game-unit_slot-list tbody tr') || []).map((tr) => {
    const cells = tr.querySelectorAll('td');
    const button = cells[0]?.querySelector('[data-feature-popover]');
    const pop = popoverRows(button?.getAttribute('data-feature-popover'));
    return {
      name: text(cells[0]),
      weight: text(cells[1]),
      pylons: cells.slice(2).filter((td) => td.querySelector('img')).length,
      stats: pop.rows,
    };
  }).filter((w) => w.name);
  const suspendedRows = charsRows(suspendedBlock);

  return { version: SPECS_VERSION, unit, name, rank, features, flight, general, guns, suspended, suspended_limits: suspendedRows };
}

/** Spec store: get(unit) -> specs or null (reads the wiki on first use). */
export function vehicleSpecsStore({ dir = defaultSpecsDir(), fetchImpl = fetch, now = () => Date.now(), log = null, concurrency = 2 } = {}) {
  const misses = new Map();
  const pending = new Map();
  let running = 0;
  const queue = [];

  // At most `concurrency` wiki requests at a time.
  async function limited(fn) {
    if (running >= concurrency) await new Promise((resolve) => queue.push(resolve));
    running += 1;
    try {
      return await fn();
    } finally {
      running -= 1;
      queue.shift()?.();
    }
  }

  async function download(id) {
    const res = await fetchImpl(`${WIKI_UNIT}/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'PotatoCupOverlay/1.0 (+vehicle specs for a tournament stream)', accept: 'text/html' },
    });
    if (!res.ok) return null;
    const body = await res.text();
    if (!body || body.length > MAX_BYTES) return null;
    const specs = parseUnitPage(body, id);
    if (!specs) return null;
    const saved = { ...specs, fetched_at: new Date(now()).toISOString() };
    const path = join(dir, `${id}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.tmp`, JSON.stringify(saved));
    await rename(`${path}.tmp`, path);
    return saved;
  }

  function refresh(id) {
    if (!pending.has(id)) {
      pending.set(id, limited(() => download(id))
        .catch((err) => {
          log?.warn?.({ err: err.message, unit: id }, 'vehicle specs download failed');
          return null;
        })
        .then((specs) => {
          if (!specs) misses.set(id, now());
          else misses.delete(id);
          pending.delete(id);
          return specs;
        }));
    }
    return pending.get(id);
  }

  async function get(unit) {
    const id = unitId(unit);
    if (!id) return null;
    let cached = null;
    try {
      cached = JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8'));
    } catch {
      // not cached yet
    }
    const usable = cached?.version === SPECS_VERSION ? cached : null;
    const missAt = misses.get(id);
    const recentMiss = missAt !== undefined && now() - missAt < MISS_MS;
    if (usable) {
      // Old: served as is, read again in the background.
      if (now() - Date.parse(usable.fetched_at) > FRESH_MS && !recentMiss) refresh(id);
      return usable;
    }
    if (recentMiss) return null;
    return refresh(id);
  }

  return { get };
}
