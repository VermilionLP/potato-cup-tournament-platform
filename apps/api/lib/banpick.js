// Ban / Pick on the server (POST /tournaments/:id/matches/:matchId/banpick).
// The server holds each match's Ban / Pick and makes the random draws, so
// both players, admins and the overlay see the same thing and a draw can't
// be redone by reloading a page.
//
// Stored in matches.banpick (migration 044) as
//   { rev, state, log }
// state: as initialBanPick() (rules included); the transitions mirror
//   apps/web/src/lib/banpick.js (kept equal by apps/web/test/banpick-server.test.js).
// log: every action with its outcome:
//   { n, at, by, side, action, group, vehicle, undone?, target? }
//   by: the player id, or "admin"; side: "A" / "B" for bans.
// The state is the log replayed (after the last reset, without undone
// entries), so undo marks an entry undone and replays; the undo itself is
// logged too, so redraws by undoing stay visible.

export const DEFAULT_RULES = { bansPerPlayer: 1, groupRerolls: null, vehicleRerolls: null, drawVehicle: true };
export const ACTIONS = ['ban', 'pass', 'drawGroup', 'removeGroup', 'confirmGroup', 'backToGroups', 'drawVehicle', 'removeVehicle', 'confirm', 'undo', 'reset'];
export const MAX_LOG = 300;

/** Vehicles grouped by `group` (names once per group), as on the web. */
export function groupVehicles(vehicles = []) {
  const groups = new Map();
  for (const v of vehicles) {
    if (!groups.has(v.group)) groups.set(v.group, new Set());
    groups.get(v.group).add(v.name);
  }
  return [...groups.entries()].map(([group, names]) => ({ group, vehicles: [...names].map((name) => ({ name })) }));
}

export function initialBanPick(rules = DEFAULT_RULES) {
  return {
    rules,
    phase: rules.bansPerPlayer > 0 ? 'ban' : 'drawGroup',
    bans: [],
    removedGroups: [],
    removedVehicles: [],
    group: null,
    groupConfirmed: false,
    vehicle: null,
  };
}

export function emptyRecord(rules) {
  return { rev: 0, state: initialBanPick(rules), log: [] };
}

export function banTurn(state) {
  return state.phase === 'ban' ? (state.bans.length % 2 === 0 ? 'A' : 'B') : null;
}

const banned = (state, group) => state.bans.some((b) => b.group === group);

export function availableGroups(state, grouped) {
  return grouped
    .filter((g) => !banned(state, g.group) && !state.removedGroups.includes(g.group)
      && g.vehicles.some((v) => !state.removedVehicles.includes(v.name)))
    .map((g) => g.group);
}

export function availableVehicles(state, grouped, group) {
  const entry = grouped.find((g) => g.group === group);
  return entry ? entry.vehicles.filter((v) => !state.removedVehicles.includes(v.name)).map((v) => v.name) : [];
}

function rerollsLeft(state) {
  const r = state.rules;
  return {
    groups: r.groupRerolls === null ? null : Math.max(0, r.groupRerolls - state.removedGroups.length),
    vehicles: r.vehicleRerolls === null ? null : Math.max(0, r.vehicleRerolls - state.removedVehicles.length),
  };
}

/**
 * Applies one logged entry (with its outcome) to a state. Returns the new
 * state, or null when the entry does not fit the state.
 */
export function step(state, entry) {
  const r = state.rules;
  switch (entry.action) {
    case 'ban':
    case 'pass': {
      if (state.phase !== 'ban') return null;
      const group = entry.action === 'pass' ? null : entry.group;
      if (group && banned(state, group)) return null;
      const bans = [...state.bans, { by: banTurn(state), group, vehicle: group ? entry.vehicle || null : null }];
      return { ...state, bans, phase: bans.length >= r.bansPerPlayer * 2 ? 'drawGroup' : 'ban' };
    }
    case 'drawGroup':
      if (state.phase !== 'drawGroup' || !entry.group) return null;
      if (state.group && r.groupRerolls !== null) return null;
      return { ...state, group: entry.group, vehicle: null };
    case 'removeGroup':
      if (state.phase !== 'drawGroup' || !state.group || rerollsLeft(state).groups === 0) return null;
      return { ...state, removedGroups: [...state.removedGroups, state.group], group: null };
    case 'confirmGroup':
      if (state.phase !== 'drawGroup' || !state.group || !r.drawVehicle) return null;
      return { ...state, groupConfirmed: true, phase: 'drawVehicle', vehicle: null };
    case 'backToGroups':
      if (state.phase !== 'drawVehicle' || r.groupRerolls !== null || r.vehicleRerolls !== null) return null;
      return { ...state, groupConfirmed: false, phase: 'drawGroup', group: null, vehicle: null };
    case 'drawVehicle':
      if (state.phase !== 'drawVehicle' || !entry.vehicle) return null;
      if (state.vehicle && r.vehicleRerolls !== null) return null;
      return { ...state, vehicle: entry.vehicle };
    case 'removeVehicle':
      if (state.phase !== 'drawVehicle' || !state.vehicle || rerollsLeft(state).vehicles === 0) return null;
      return { ...state, removedVehicles: [...state.removedVehicles, state.vehicle], vehicle: null };
    case 'confirm': {
      const ok = r.drawVehicle ? state.phase === 'drawVehicle' && state.vehicle : state.phase === 'drawGroup' && state.group;
      return ok ? { ...state, phase: 'done' } : null;
    }
    default:
      return null;
  }
}

/** Entries that make up the state: after the last reset, not undone, not undos. */
export function effectiveEntries(log = []) {
  let start = 0;
  log.forEach((e, i) => { if (e.action === 'reset') start = i + 1; });
  return log.slice(start).filter((e) => !e.undone && e.action !== 'undo' && e.action !== 'reset');
}

/** The state the log leads to, starting from `rules`. */
export function replay(rules, log) {
  let state = initialBanPick(rules);
  for (const e of effectiveEntries(log)) state = step(state, e) || state;
  return state;
}

const pick = (list, rand) => (list.length ? list[Math.floor(rand() * list.length)] : null);

/**
 * Why `who` may not do `action` now, or null. who: { admin, side } with
 * side "A" / "B" (the match's player1 / player2) or null.
 */
export function actionProblem(record, action, who, by) {
  const { state, log } = record;
  if (!ACTIONS.includes(action)) return '未知的 Ban/Pick 操作';
  if (who.admin) return null;
  if (!who.side) return '只有本场的两位选手或管理员可以操作 Ban/Pick';
  if (action === 'reset') return '只有管理员可以重置 Ban/Pick';
  if (action === 'undo') {
    const last = effectiveEntries(log).at(-1);
    if (!last) return '没有可以撤销的操作';
    if (last.by !== by || !['ban', 'pass'].includes(last.action)) return '选手只能撤销自己刚才的禁用；其他操作请找管理员撤销';
    return null;
  }
  if (state.phase === 'done') return '抽取结果已确认，需要管理员撤销或重置';
  if ((action === 'ban' || action === 'pass') && banTurn(state) !== who.side) return `现在轮到 ${banTurn(state) || '—'} 方禁用`;
  return null;
}

/**
 * Carries out an action. ctx: { grouped, rules (the template's, for a
 * reset), who: { admin, side }, by, at, rand }. Returns { record, entry }
 * or { error }.
 */
export function act(record, input, ctx) {
  const { action, group = null, vehicle = null } = input || {};
  const { grouped, who, by, at = new Date().toISOString(), rand = Math.random } = ctx;
  const problem = actionProblem(record, action, who, by);
  if (problem) return { error: problem, status: problem.startsWith('未知') ? 400 : 403 };
  const { state, log } = record;
  if (log.length >= MAX_LOG && action !== 'reset') return { error: '操作次数太多了，请管理员重置 Ban/Pick' };

  const n = (log.at(-1)?.n || 0) + 1;
  const base = { n, at, by, side: who.side || null, action };

  if (action === 'reset') {
    const rules = ctx.rules || state.rules;
    const entry = { ...base, group: null, vehicle: null };
    // Old entries before the previous reset are dropped to keep the log short.
    let keepFrom = 0;
    log.forEach((e, i) => { if (e.action === 'reset') keepFrom = i; });
    return { entry, record: { rev: record.rev + 1, state: initialBanPick(rules), log: [...log.slice(keepFrom), entry] } };
  }

  if (action === 'undo') {
    const target = effectiveEntries(log).at(-1);
    if (!target) return { error: '没有可以撤销的操作' };
    const marked = log.map((e) => (e.n === target.n ? { ...e, undone: true } : e));
    const entry = { ...base, target: target.n, group: target.group || null, vehicle: target.vehicle || null, undoneAction: target.action };
    const next = [...marked, entry];
    return { entry, record: { rev: record.rev + 1, state: replay(state.rules, next), log: next } };
  }

  let entry;
  switch (action) {
    case 'ban': {
      const g = grouped.find((x) => x.group === group);
      if (!g) return { error: '没有这个大组' };
      if (vehicle && !g.vehicles.some((v) => v.name === vehicle)) return { error: '这辆载具不在这个大组里' };
      if (banned(state, group)) return { error: '这个大组已经被禁用了' };
      entry = { ...base, side: banTurn(state), group, vehicle: vehicle || null };
      break;
    }
    case 'pass':
      entry = { ...base, side: banTurn(state), group: null, vehicle: null };
      break;
    case 'drawGroup': {
      const options = availableGroups(state, grouped);
      if (!options.length) return { error: '没有可抽的大组了' };
      entry = { ...base, group: pick(options, rand), vehicle: null };
      break;
    }
    case 'drawVehicle': {
      const options = availableVehicles(state, grouped, state.group);
      if (!options.length) return { error: '这个大组没有可抽的载具了' };
      entry = { ...base, group: state.group, vehicle: pick(options, rand) };
      break;
    }
    default:
      entry = { ...base, group: state.group, vehicle: state.vehicle };
  }
  const next = step(state, entry);
  if (!next) return { error: '现在不能进行这个操作' };
  return { entry, record: { rev: record.rev + 1, state: next, log: [...log, entry] } };
}
