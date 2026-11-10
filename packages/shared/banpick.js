// Ban / Pick for a match: one set of rules for the server (which holds each
// match's Ban / Pick, makes the random draws and keeps a log) and the
// website (which shows it, and runs the vehicle pool page's local preview).
//
// Flow: the players take turns banning vehicle groups (A, B, A, B... as many
// as the template's rules allow, a pass also uses a turn), then a group is
// drawn at random from the groups still available. The group can be removed
// (and another drawn) or accepted; inside an accepted group a vehicle is
// drawn and can be removed for another one. Removed groups and vehicles never
// come up again. A template can limit the removals, or end at the group
// (any vehicle of it may be used).
//
// On the server a match keeps { rev, state, log } (matches.banpick,
// migration 044). log: every action with its outcome:
//   { n, at, by, side, action, group, vehicle, undone?, target? }
//   by: the player id, or "admin"; side: "A" / "B" for bans.
// The state is the log replayed (after the last reset, without undone
// entries), so undo marks an entry undone and replays; the undo itself is
// logged too, so redraws by undoing stay visible.

// Rules:
//   bansPerPlayer   groups each player bans, taking turns A, B, A, B...
//   groupRerolls    drawn groups that may be removed (null = no limit)
//   vehicleRerolls  drawn vehicles that may be removed (null = no limit)
//   drawVehicle     false: the drawn group is the result
export const DEFAULT_RULES = { bansPerPlayer: 1, groupRerolls: null, vehicleRerolls: null, drawVehicle: true };
export const ACTIONS = ['ban', 'pass', 'drawGroup', 'removeGroup', 'confirmGroup', 'backToGroups', 'drawVehicle', 'removeVehicle', 'confirm', 'undo', 'reset'];
export const MAX_LOG = 300;

const clampInt = (value, min, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Rules with defaults filled in and values kept in range. */
export function normalizeRules(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const limit = (v) => (v === null || v === undefined || v === '' ? null : clampInt(v, 0, 20));
  return {
    bansPerPlayer: clampInt(r.bansPerPlayer, 0, 3) ?? DEFAULT_RULES.bansPerPlayer,
    groupRerolls: limit(r.groupRerolls),
    vehicleRerolls: limit(r.vehicleRerolls),
    drawVehicle: r.drawVehicle === undefined ? DEFAULT_RULES.drawVehicle : Boolean(r.drawVehicle),
  };
}

/** Rules as a short line: "每人禁 1 组 · 大组可移出 2 次 · 载具可不限次移出". */
export function rulesSummary(raw) {
  const r = normalizeRules(raw);
  const removals = (what, n) => (n === null ? `${what}可不限次移出` : n === 0 ? `${what}不可移出` : `${what}可移出 ${n} 次`);
  return [
    r.bansPerPlayer ? `每人禁 ${r.bansPerPlayer} 组` : '不禁用',
    removals('大组', r.groupRerolls),
    r.drawVehicle ? removals('载具', r.vehicleRerolls) : '抽到大组即结束',
  ].join(' · ');
}

/**
 * Vehicles grouped by `group`, in first-seen order. A name listed more than
 * once in a group (the pool files contain a few repeats, e.g. the German and
 * Soviet MiG-15bis) is shown once; differing nations are merged.
 */
export function groupVehicles(vehicles = []) {
  const groups = new Map();
  for (const v of vehicles) {
    if (!groups.has(v.group)) groups.set(v.group, new Map());
    const byName = groups.get(v.group);
    const seen = byName.get(v.name);
    if (!seen) byName.set(v.name, { ...v });
    else if (v.nation && seen.nation && !seen.nation.split(' / ').includes(v.nation)) seen.nation = `${seen.nation} / ${v.nation}`;
  }
  return [...groups.entries()].map(([group, byName]) => ({ group, vehicles: [...byName.values()] }));
}

export function initialBanPick(rules) {
  const r = normalizeRules(rules);
  return {
    rules: r,
    phase: r.bansPerPlayer > 0 ? 'ban' : 'drawGroup',
    bans: [], // [{ by: "A" | "B", group, vehicle }]; group null = a pass
    removedGroups: [],
    removedVehicles: [],
    group: null, // drawn group
    groupConfirmed: false,
    vehicle: null, // drawn vehicle name
  };
}

export function emptyRecord(rules) {
  return { rev: 0, state: initialBanPick(rules), log: [] };
}

const rulesOf = (state) => state.rules || DEFAULT_RULES;

/** Whose turn it is to ban ("A" / "B"), or null outside the ban phase. */
export function banTurn(state) {
  return state.phase === 'ban' ? (state.bans.length % 2 === 0 ? 'A' : 'B') : null;
}

/** Bans made by "A" or "B". */
export function bansOf(state, by) {
  return state.bans.filter((b) => b.by === by);
}

export function isGroupBanned(state, group) {
  return state.bans.some((b) => b.group && b.group === group);
}

/** Who banned `group` ("A" / "B"), or null. */
export function bannedBy(state, group) {
  return state.bans.find((b) => b.group === group)?.by || null;
}

/** Groups that can still be drawn: not banned, not removed, with vehicles left. */
export function availableGroups(state, grouped) {
  return grouped
    .filter((g) => !isGroupBanned(state, g.group) && !state.removedGroups.includes(g.group) && g.vehicles.some((v) => !state.removedVehicles.includes(v.name)))
    .map((g) => g.group);
}

/** Vehicles of `group` that can still be drawn. */
export function availableVehicles(state, grouped, group) {
  const entry = grouped.find((g) => g.group === group);
  return entry ? entry.vehicles.filter((v) => !state.removedVehicles.includes(v.name)).map((v) => v.name) : [];
}

/** Removals left: { groups, vehicles }, null = no limit. */
export function rerollsLeft(state) {
  const r = rulesOf(state);
  return {
    groups: r.groupRerolls === null ? null : Math.max(0, r.groupRerolls - state.removedGroups.length),
    vehicles: r.vehicleRerolls === null ? null : Math.max(0, r.vehicleRerolls - state.removedVehicles.length),
  };
}

/** The result can be confirmed once there is one (a vehicle, or a group when the draw ends there). */
export function canConfirm(state) {
  return rulesOf(state).drawVehicle ? state.phase === 'drawVehicle' && Boolean(state.vehicle) : state.phase === 'drawGroup' && Boolean(state.group);
}

/** What the match is played with: the vehicle, or "<group>（组内任选）". */
export function resultLabel(state) {
  if (state.vehicle) return state.vehicle;
  return state.group ? `${state.group}（组内任选）` : '';
}

/**
 * Applies one entry (an action with its outcome: the drawn group / vehicle)
 * to a state. Returns the new state, or null when the entry does not fit.
 */
export function step(state, entry) {
  const r = rulesOf(state);
  switch (entry.action) {
    case 'ban':
    case 'pass': {
      if (state.phase !== 'ban') return null;
      const group = entry.action === 'pass' ? null : entry.group || null;
      if (group && isGroupBanned(state, group)) return null;
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
    case 'confirm':
      return canConfirm(state) ? { ...state, phase: 'done' } : null;
    default:
      return null;
  }
}

const pick = (list, rand) => (list.length ? list[Math.floor(rand() * list.length)] : null);

/** The outcome of a draw: the entry's group / vehicle, or null when there is nothing to draw. */
function draw(state, grouped, action, rand) {
  if (action === 'drawGroup') {
    const group = pick(availableGroups(state, grouped), rand);
    return group ? { group, vehicle: null } : null;
  }
  const vehicle = pick(availableVehicles(state, grouped, state.group), rand);
  return vehicle ? { group: state.group, vehicle } : null;
}

/**
 * One action on a local Ban / Pick (the vehicle pool page's preview; events
 * keep theirs on the server). Same actions and transitions as the server.
 */
export function localAct(state, grouped, action, { group = null, vehicle = null } = {}, rand = Math.random) {
  if (action === 'reset') return initialBanPick(state.rules);
  let entry = { action, group, vehicle };
  if (action === 'drawGroup' || action === 'drawVehicle') {
    const out = draw(state, grouped, action, rand);
    if (!out) return state;
    entry = { action, ...out };
  }
  return step(state, entry) || state;
}

/** Entries that make up the state: after the last reset, not undone, not undos. */
export function effectiveEntries(log = []) {
  let start = 0;
  log.forEach((e, i) => {
    if (e.action === 'reset') start = i + 1;
  });
  return log.slice(start).filter((e) => !e.undone && e.action !== 'undo' && e.action !== 'reset');
}

/** The state the log leads to, starting from `rules`. */
export function replay(rules, log) {
  let state = initialBanPick(rules);
  for (const e of effectiveEntries(log)) state = step(state, e) || state;
  return state;
}

/**
 * Why `who` may not do `action` now, or null. who: { admin, side } with
 * side "A" / "B" (the match's player1 / player2) or null; by: the player id.
 */
export function actionProblem(record, action, who, by) {
  const { state, log } = record;
  if (!ACTIONS.includes(action)) return '未知的 Ban/Pick 操作';
  if (who?.admin) return null;
  if (!who?.side) return '只有本场的两位选手或管理员可以操作 Ban/Pick';
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
 * Whether the viewer may do `action` on a match's Ban / Pick (the buttons
 * shown): actionProblem without the message. me = { admin, side }; a match
 * without a Ban / Pick yet lets its players start one.
 */
export function mayAct(record, action, me, myId) {
  if (!record?.state) return Boolean(me?.admin) || (Boolean(me?.side) && action !== 'reset' && action !== 'undo');
  return actionProblem({ log: [], ...record }, action, me || {}, myId) === null;
}

/**
 * Carries out an action on the server. ctx: { grouped, rules (the
 * template's, for a reset), who: { admin, side }, by, at, rand }. Returns
 * { record, entry } or { error, status? }.
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
    log.forEach((e, i) => {
      if (e.action === 'reset') keepFrom = i;
    });
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
      if (isGroupBanned(state, group)) return { error: '这个大组已经被禁用了' };
      entry = { ...base, side: banTurn(state), group, vehicle: vehicle || null };
      break;
    }
    case 'pass':
      entry = { ...base, side: banTurn(state), group: null, vehicle: null };
      break;
    case 'drawGroup':
    case 'drawVehicle': {
      const out = draw(state, grouped, action, rand);
      if (!out) return { error: action === 'drawGroup' ? '没有可抽的大组了' : '这个大组没有可抽的载具了' };
      entry = { ...base, ...out };
      break;
    }
    default:
      entry = { ...base, group: state.group, vehicle: state.vehicle };
  }
  const next = step(state, entry);
  if (!next) return { error: '现在不能进行这个操作' };
  return { entry, record: { rev: record.rev + 1, state: next, log: [...log, entry] } };
}
