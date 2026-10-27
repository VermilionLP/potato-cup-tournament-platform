// Vehicle pools for Ban / Pick, one per event type. Pools edited on the site
// (saved on the server) replace the ones bundled in $lib/data.
// Kept free of $lib imports so it can be tested with node --test.

import { VEHICLE_POOLS } from "./tournament.js";

export const POOL_FIELDS = ["name", "nation", "br", "type", "group"];

/**
 * One entry per event type, in VEHICLE_POOLS order:
 * { id, name, code, vehicles, defaults, custom, updated_at }.
 * `saved` is the server's { [id]: { vehicles, updated_at } }; `defaults` the
 * bundled pools ($lib/data/vehiclePools.js).
 */
export function mergePools(saved = {}, defaults = []) {
  return VEHICLE_POOLS.map((type) => {
    const bundled = defaults.find((p) => p.id === type.id)?.vehicles || [];
    const own = saved?.[type.id];
    return {
      id: type.id,
      name: type.name,
      code: type.code,
      vehicles: own?.vehicles?.length ? own.vehicles : bundled,
      defaults: bundled,
      custom: Boolean(own?.vehicles?.length),
      updated_at: own?.updated_at || null,
    };
  });
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
