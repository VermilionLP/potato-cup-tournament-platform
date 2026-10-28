// Vehicle pool contents: [{ name, nation, br, type, group }]. Pure: shared
// by the API routes and their tests.

export const MAX_POOL_VEHICLES = 500;

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

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
    });
  }
  return { vehicles };
}

// ---- Templates -------------------------------------------------------------
// A vehicle pool template: { id, name, event_type, game_modes, rules,
// sort_order, vehicles }. game_modes lists the modes it is for; empty means
// every mode. Events use the most specific template for their type and mode
// (see resolveTemplate) unless an admin picked one.

// Ban / Pick rules (mirrors apps/web/src/lib/banpick.js):
//   bansPerPlayer   groups each player bans, taking turns A, B, A, B...
//   groupRerolls    drawn groups that may be removed (null = no limit)
//   vehicleRerolls  drawn vehicles that may be removed (null = no limit)
//   drawVehicle     false: the drawn group is the result
export const DEFAULT_RULES = { bansPerPlayer: 1, groupRerolls: null, vehicleRerolls: null, drawVehicle: true };

const clampInt = (value, min, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Rules with defaults filled in and values kept in range. */
export function normalizeRules(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const limit = (v) => (v === null || v === undefined || v === '' ? null : clampInt(v, 0, 20));
  const bans = clampInt(r.bansPerPlayer, 0, 3);
  return {
    bansPerPlayer: bans ?? DEFAULT_RULES.bansPerPlayer,
    groupRerolls: limit(r.groupRerolls),
    vehicleRerolls: limit(r.vehicleRerolls),
    drawVehicle: r.drawVehicle === undefined ? DEFAULT_RULES.drawVehicle : Boolean(r.drawVehicle),
  };
}

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
