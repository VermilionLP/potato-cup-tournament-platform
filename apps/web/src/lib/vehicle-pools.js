// Vehicle pool templates for Ban / Pick: { id, name, event_type,
// game_modes, rules, sort_order, vehicles } from GET /api/vehicle-pools.
// Kept free of $lib imports so it can be tested with node --test.

export const POOL_FIELDS = ["name", "nation", "br", "type", "group"];

/**
 * The template an event uses (mirrors resolveTemplate in
 * apps/api/lib/vehicle-pools.js): the admin's choice when it exists;
 * otherwise, among templates of the event's type by sort_order, the first
 * made for its game mode, else the first made for every mode, else the first.
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

/** "AB" / "AB · RB" / "全部模式" for a template's modes. */
export function modesLabel(modes = []) {
  return modes.length ? modes.map((m) => String(m).toUpperCase()).join(" · ") : "全部模式";
}

function cleanVehicle(raw) {
  const text = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const name = text(raw?.name, 80);
  const brText = raw?.br === null || raw?.br === undefined ? "" : String(raw.br).trim();
  const br = brText === "" ? null : Number(brText);
  return {
    name,
    nation: text(raw?.nation, 40),
    br: Number.isFinite(br) ? br : brText === "" ? null : NaN,
    type: text(raw?.type, 30),
    group: text(raw?.group, 80) || name,
  };
}

/** First problem in a vehicle list, or "" when it can be saved. */
export function vehicleListProblem(vehicles) {
  if (!vehicles.length) return "载具池至少需要 1 辆载具";
  if (vehicles.length > 500) return "载具池最多 500 辆载具";
  for (const [i, v] of vehicles.entries()) {
    if (!String(v.name ?? "").trim()) return `第 ${i + 1} 行缺少载具名称`;
    const br = v.br === "" || v.br === null || v.br === undefined ? null : Number(v.br);
    if (br !== null && !(Number.isFinite(br) && br >= 0 && br <= 30)) return `第 ${i + 1} 行（${v.name}）的 BR 不是 0-30 之间的数字`;
  }
  return "";
}

// RFC 4180-ish CSV: quoted fields, "" for a quote, commas/newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

/**
 * Vehicles from an imported file: a JSON array (the bundled pool format),
 * { vehicles: [...] }, or CSV with a header row naming the columns
 * name, nation, br, type, group. Throws with a readable message.
 */
export function parsePoolFile(text, fileName = "") {
  const body = String(text ?? "").replace(/^﻿/, "").trim();
  if (!body) throw new Error("文件是空的");
  let list;
  if (/\.json$/i.test(fileName) || body.startsWith("[") || body.startsWith("{")) {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error("JSON 格式不正确");
    }
    list = Array.isArray(data) ? data : data?.vehicles;
    if (!Array.isArray(list)) throw new Error("JSON 里没有找到载具列表（应为数组或 { vehicles: [...] }）");
  } else {
    const [header, ...rows] = parseCsv(body);
    const columns = header.map((h) => h.trim().toLowerCase());
    if (!columns.includes("name")) throw new Error("CSV 第一行需要列名，至少包含 name");
    list = rows.map((cells) => Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? ""])));
  }
  const vehicles = list.map(cleanVehicle);
  const problem = vehicleListProblem(vehicles);
  if (problem) throw new Error(problem);
  return vehicles;
}

export function poolToJson(vehicles) {
  return JSON.stringify(vehicles.map((v) => Object.fromEntries(POOL_FIELDS.map((f) => [f, v[f] ?? (f === "br" ? null : "")]))), null, 2);
}

export function poolToCsv(vehicles) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [POOL_FIELDS.join(","), ...vehicles.map((v) => POOL_FIELDS.map((f) => cell(v[f])).join(","))].join("\n") + "\n";
}

/**
 * Vehicles as Ban / Pick will use them once saved: rows with a name, the
 * group defaulting to the name, BR as a number (null when blank or invalid).
 * Used by the template page's preview, so unsaved edits can be tried out.
 */
export function previewVehicles(rows = []) {
  return rows
    .map((raw) => {
      const name = String(raw?.name ?? "").trim();
      const brText = raw?.br === null || raw?.br === undefined ? "" : String(raw.br).trim();
      const br = brText === "" ? null : Number(brText);
      return {
        name,
        nation: String(raw?.nation ?? "").trim(),
        br: Number.isFinite(br) ? br : null,
        type: String(raw?.type ?? "").trim(),
        group: String(raw?.group ?? "").trim() || name,
      };
    })
    .filter((v) => v.name);
}

/**
 * Per group, in pool order: vehicle count, BR range and nations, to check
 * groups are balanced before using the pool.
 */
export function groupSummary(vehicles = []) {
  const groups = new Map();
  for (const v of vehicles) {
    if (!groups.has(v.group)) groups.set(v.group, { group: v.group, names: new Set(), brs: [], nations: [] });
    const g = groups.get(v.group);
    g.names.add(v.name);
    if (v.br !== null && v.br !== undefined) g.brs.push(v.br);
    if (v.nation && !g.nations.includes(v.nation)) g.nations.push(v.nation);
  }
  return [...groups.values()].map((g) => ({
    group: g.group,
    count: g.names.size,
    brMin: g.brs.length ? Math.min(...g.brs) : null,
    brMax: g.brs.length ? Math.max(...g.brs) : null,
    nations: g.nations,
  }));
}
