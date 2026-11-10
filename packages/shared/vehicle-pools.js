// Vehicle pool templates, shared by the API (which stores them) and the
// website (which picks an event's template the same way).
//
// Contents: [{ name, nation, br, type, group, wiki? }] (wiki: War Thunder
// unit id for the picture, optional).

import { DEFAULT_RULES, normalizeRules } from './banpick.js';

export { DEFAULT_RULES, normalizeRules };

export const MAX_POOL_VEHICLES = 500;

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// A War Thunder unit id ("p-47d-28"); anything else is dropped.
const wikiId = (value) => {
  const id = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(id) ? id : '';
};

/**
 * Cleans a vehicle list for storage. Returns { vehicles } or { error }.
 * `group` defaults to the vehicle's name; `br` is a number or null.
 */
export function normalizeVehicles(input) {
  if (!Array.isArray(input)) return { error: '载具列表必须是数组' };
  if (!input.length) return { error: '载具池至少需要 1 辆载具' };
  if (input.length > MAX_POOL_VEHICLES) return { error: `载具池最多 ${MAX_POOL_VEHICLES} 辆载具` };
  const vehicles = [];
  for (const [i, raw] of input.entries()) {
    if (!raw || typeof raw !== 'object') return { error: `第 ${i + 1} 行不是载具` };
    const name = text(raw.name, 80);
    if (!name) return { error: `第 ${i + 1} 行缺少载具名称` };
    let br = null;
    if (raw.br !== null && raw.br !== undefined && raw.br !== '') {
      br = Number(raw.br);
      if (!Number.isFinite(br) || br < 0 || br > 30) return { error: `第 ${i + 1} 行（${name}）的 BR 不是 0-30 之间的数字` };
      br = Math.round(br * 100) / 100;
    }
    vehicles.push({
      name,
      nation: text(raw.nation, 40),
      br,
      type: text(raw.type, 30),
      group: text(raw.group, 80) || name,
      ...(wikiId(raw.wiki) ? { wiki: wikiId(raw.wiki) } : {}),
    });
  }
  return { vehicles };
}

// ---- Templates -------------------------------------------------------------
// A vehicle pool template: { id, name, event_type, game_modes, rules,
// sort_order, vehicles }. game_modes lists the modes it is for; empty means
// every mode. Events use the most specific template for their type and mode
// (see resolveTemplate) unless an admin picked one.

// Ban / Pick rules: normalizeRules in ./banpick.js.

const clampInt = (value, min, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Cleans a template for storage. With `partial`, only the fields present
 * are returned (for updates). Returns { template } or { error }.
 */
export function normalizeTemplate(input, { eventTypes, gameModes, partial = false } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('name')) {
    const name = text(body.name, 40);
    if (!name) return { error: '请填写模板名称' };
    out.name = name;
  }
  if (!partial || has('event_type')) {
    if (!eventTypes.includes(body.event_type)) return { error: `比赛类型必须是 ${eventTypes.join(' / ')} 之一` };
    out.event_type = body.event_type;
  }
  if (!partial || has('game_modes')) {
    const modes = Array.isArray(body.game_modes) ? body.game_modes : [];
    if (modes.some((m) => !gameModes.includes(m))) return { error: `游戏模式必须是 ${gameModes.join(' / ')}` };
    out.game_modes = [...new Set(modes)];
  }
  if (!partial || has('rules')) out.rules = normalizeRules(body.rules);
  if (!partial || has('sort_order')) out.sort_order = clampInt(body.sort_order, 0, 9999) ?? 100;
  if (!partial || has('vehicles')) {
    const { vehicles, error } = normalizeVehicles(body.vehicles);
    if (error) return { error };
    out.vehicles = vehicles;
  }
  return { template: out };
}

/**
 * The template an event uses: the admin's choice when it exists; otherwise,
 * among templates of the event's type (by sort_order), the first made for its
 * game mode, else the first made for every mode, else the first of the type.
 */
export function resolveTemplate(templates = [], { vehicle_pool: type, game_mode: mode, vehicle_template: chosen } = {}) {
  if (chosen) {
    const own = templates.find((t) => t.id === chosen);
    if (own) return own;
  }
  const ofType = templates
    .filter((t) => t.event_type === type)
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.id).localeCompare(String(b.id)));
  const modes = (t) => t.game_modes || [];
  return ofType.find((t) => modes(t).includes(mode)) || ofType.find((t) => !modes(t).length) || ofType[0] || null;
}
