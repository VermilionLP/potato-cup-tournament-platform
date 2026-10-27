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
