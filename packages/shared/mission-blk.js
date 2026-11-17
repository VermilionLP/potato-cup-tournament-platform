// War Thunder mission files (.blk text) for the 比赛地图 page: reading the
// settings people care about and changing them in place, without rewriting
// the rest of the file (so whatever the mission editor wrote stays as it
// was). The server checks and edits with these; the page shows the same
// summary and checks the raw editor as you type.
//
// The format: blocks `name{ ... }`, entries `key:type=value` (t text,
// i integer, r number, b yes/no, p2/p3/... points), "quoted" text and
// // or /* */ comments. A mission keeps its settings in
// mission_settings{ mission{ ... } }; the vehicles both teams may take are in
// mission{ customRules{ teams{ teamA{ unlimitedUnits{ unit:b=yes } } } } }.
// Without customRules there is no vehicle limit: players take their own
// vehicles (the room's rules apply). Turning the limit off removes that
// block; turning it on puts one back (the old one, or a new "sharedPool"
// rule like TheArena's missions have).

export const MAX_MISSION_BYTES = 2 * 1024 * 1024;

// Settings in mission_settings{ mission{} } the page edits. Labels and help
// are the page's (Chinese, translated there).
export const MISSION_FIELDS = {
  locName: { type: 't', max: 120 },
  locDesc: { type: 't', max: 500 },
  scoreLimit: { type: 'i', min: 1, max: 1000 },
  timeLimit: { type: 'i', min: 1, max: 600 },
  environment: { type: 't', pattern: /^[A-Za-z0-9][A-Za-z0-9_:.]{0,31}$/ },
  weather: { type: 't', pattern: /^[A-Za-z][A-Za-z0-9_]{0,31}$/ },
  respawnTimeMultiplier: { type: 'r', min: 0, max: 100 },
  deathPenaltyMul: { type: 'r', min: 0, max: 100 },
  isBotsAllowed: { type: 'b' },
  optionalTakeOff: { type: 'b' },
};

// The values of the game's custom battle menus, in the menus' order (from
// the game's menu_options.csv: options/weather<value>, options/time<value>).
// Other values in a file are kept as they are.
export const WEATHERS = ['clear', 'good', 'hazy', 'mist', 'thin_clouds', 'cloudy_windy', 'cloudy', 'overcast', 'poor', 'blind', 'rain', 'storm'];
export const ENVIRONMENTS = ['Dawn', 'Morning', 'Noon', 'Day', 'Evening', 'Dusk', 'Night', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18'];

export const TEAMS = ['teamA', 'teamB'];
const UNITS_PATH = (team) => ['mission_settings', 'mission', 'customRules', 'teams', team, 'unlimitedUnits'];
const MISSION_PATH = ['mission_settings', 'mission'];
const RULES_PATH = [...MISSION_PATH, 'customRules'];
export const UNIT_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}$/;

const lineOf = (text, at) => text.slice(0, at).split('\n').length;

/**
 * The blocks of a file: [{ name, start, open, close, parent, depth }]
 * (offsets of the name, "{" and "}"; parent is an index or null), or an
 * error in words with its line.
 */
export function scanBlocks(text) {
  const blocks = [];
  const stack = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'") {
      // ~" inside text is an escaped quote.
      let j = i + 1;
      while (j < n && !(text[j] === c && text[j - 1] !== '~')) {
        if (text[j] === '\n') return { blocks, error: `第 ${lineOf(text, i)} 行的引号没有结束` };
        j += 1;
      }
      if (j >= n) return { blocks, error: `第 ${lineOf(text, i)} 行的引号没有结束` };
      i = j + 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const j = text.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const j = text.indexOf('*/', i + 2);
      if (j < 0) return { blocks, error: `第 ${lineOf(text, i)} 行的注释没有结束` };
      i = j + 2;
      continue;
    }
    if (c === '{') {
      let k = i - 1;
      while (k >= 0 && (text[k] === ' ' || text[k] === '\t')) k -= 1;
      const end = k + 1;
      while (k >= 0 && /[\w.-]/.test(text[k])) k -= 1;
      blocks.push({ name: text.slice(k + 1, end), start: k + 1, open: i, close: -1, parent: stack.length ? stack[stack.length - 1] : null, depth: stack.length });
      stack.push(blocks.length - 1);
    } else if (c === '}') {
      if (!stack.length) return { blocks, error: `第 ${lineOf(text, i)} 行多了一个 }` };
      blocks[stack.pop()].close = i;
    }
    i += 1;
  }
  if (stack.length) {
    const b = blocks[stack[stack.length - 1]];
    return { blocks, error: `第 ${lineOf(text, b.open)} 行的 ${b.name || '块'}{ 没有对应的 }` };
  }
  return { blocks, error: null };
}

function findPath(blocks, path) {
  let parent = null;
  let found = null;
  for (const name of path) {
    const index = blocks.findIndex((b) => b.parent === parent && b.name === name);
    if (index < 0) return null;
    found = blocks[index];
    parent = index;
  }
  return found;
}

const ENTRY = /^([ \t]*)([\w.-]+):([a-z0-9]+)[ \t]*=[ \t]*(.*?)[ \t\r]*$/gm;

/** The entries directly inside a block (not in its child blocks), with offsets. */
function entriesOf(text, blocks, block) {
  const own = blocks.indexOf(block);
  const children = blocks.filter((b) => b.parent === own).sort((a, b) => a.start - b.start);
  const out = [];
  let from = block.open + 1;
  const ranges = [];
  for (const child of children) {
    ranges.push([from, child.start]);
    from = child.close + 1;
  }
  ranges.push([from, block.close]);
  for (const [a, b] of ranges) {
    const part = text.slice(a, b);
    ENTRY.lastIndex = 0;
    for (let m = ENTRY.exec(part); m; m = ENTRY.exec(part)) {
      const valueStart = a + m.index + m[0].length - m[4].length - (m[0].length - m[0].trimEnd().length);
      out.push({ indent: m[1], key: m[2], type: m[3], raw: m[4], at: a + m.index, valueStart, valueEnd: valueStart + m[4].length });
    }
  }
  return out;
}

function decode(type, raw) {
  if (type === 't') return raw.replace(/^["']|["']$/g, '').replace(/~"/g, '"');
  if (type === 'i' || type === 'r') return Number(raw);
  if (type === 'b') return /^(yes|true|on|1)$/i.test(raw);
  return raw;
}

function encode(type, value) {
  if (type === 't') return `"${String(value)}"`;
  if (type === 'b') return value ? 'yes' : 'no';
  if (type === 'r') return Number.isInteger(Number(value)) ? String(Number(value)) : String(Number(value));
  return String(Math.trunc(Number(value)));
}

/** Problems that keep a text from being a mission the game can read; [] when fine. */
export function missionProblems(text) {
  if (typeof text !== 'string' || !text.trim()) return ['地图文件是空的'];
  if (new TextEncoder().encode(text).length > MAX_MISSION_BYTES) return ['地图文件太大（最大 2 MB）'];
  if (text.includes('\u0000')) return ['这是二进制文件：请用文本格式的 .blk（任务编辑器导出的那种）'];
  const { blocks, error } = scanBlocks(text);
  if (error) return [error];
  const problems = [];
  if (!findPath(blocks, ['mission_settings'])) problems.push('缺少 mission_settings{ }');
  else if (!findPath(blocks, MISSION_PATH)) problems.push('缺少 mission_settings{ mission{ } }');
  return problems;
}

/**
 * What a mission is, for the page: { name, level, type, unitTypes, fields:
 * { locName, scoreLimit, ... }, units: { teamA, teamB } | null }. Null when
 * it cannot be read.
 */
export function missionSummary(text) {
  if (missionProblems(text).length) return null;
  const { blocks } = scanBlocks(text);
  const mission = findPath(blocks, MISSION_PATH);
  const entries = entriesOf(text, blocks, mission);
  const get = (key) => {
    const e = entries.find((x) => x.key === key);
    return e ? decode(e.type, e.raw) : null;
  };
  const fields = {};
  for (const key of Object.keys(MISSION_FIELDS)) fields[key] = get(key);
  const allowed = findPath(blocks, [...MISSION_PATH, 'allowedUnitTypes']);
  let unitTypes = null;
  if (allowed) {
    const a = Object.fromEntries(entriesOf(text, blocks, allowed).map((e) => [e.key, decode(e.type, e.raw)]));
    unitTypes = {
      air: Boolean(a.isAirplanesAllowed),
      ground: Boolean(a.isTanksAllowed),
      naval: Boolean(a.isShipsAllowed),
      helicopters: Boolean(a.isHelicoptersAllowed),
    };
  }
  let units = null;
  const lists = TEAMS.map((team) => findPath(blocks, UNITS_PATH(team)));
  if (lists.some(Boolean)) {
    units = {};
    TEAMS.forEach((team, i) => {
      units[team] = lists[i] ? entriesOf(text, blocks, lists[i]).filter((e) => e.type === 'b' && decode('b', e.raw)).map((e) => e.key) : [];
    });
  }
  return { name: get('name'), level: get('level'), type: get('type'), unitTypes, fields, units, vehicleLimit: Boolean(units), duel: duelSettings(text) };
}

// The duel ("gladiators") template the community duel maps are made from:
// rounds driven by trigger variables, two spawn spheres per team and a
// cylinder battle area. Each setting is found by what it is (the varSetInt
// actions that set a variable, the areas by name), so other maps simply
// have none of them. Labels and help are the page's.
export const DUEL_FIELDS = {
  firstCountdown: { type: 'i', min: 1, max: 600 },
  countdown: { type: 'i', min: 1, max: 600 },
  shootingDelay: { type: 'i', min: 0, max: 600 },
  forfeitAfter: { type: 'i', min: 10, max: 36000 },
  firstHit: { type: 'b' },
  bailoutDelay: { type: 'r', min: 0, max: 60 },
  spawnAltitude: { type: 'r', min: 50, max: 15000 },
  spawnDistance: { type: 'r', min: 200, max: 60000 },
  areaRadius: { type: 'r', min: 500, max: 60000 },
};
// The variable each round setting writes (its varSetInt actions in
// triggers). The countdown is set twice: when the mission starts (a trigger
// with an initMission event: the first round) and between rounds; files
// differ there (1 s, then 10 s), so they are two settings.
const DUEL_VARS = { firstCountdown: 'timer', countdown: 'timer', shootingDelay: 'shooting_timer', forfeitAfter: 'disqualification_timer' };
// "First hit wins": this trigger group and the triggers in it that run by
// themselves (hit_timer is switched on by them, so it stays as it is).
const FIRST_HIT = 'first_hit_wins';
const FIRST_HIT_TRIGGERS = ['check_t1', 'check_t2', 't1_and_t2_hit'];
const SPAWN = /^t([12])_air_spawn_\d+$/;

const insideTriggers = (blocks, b) => {
  for (let p = b.parent; p !== null; p = blocks[p].parent) if (blocks[p].depth === 0) return blocks[p].name === 'triggers';
  return false;
};
const entryOf = (text, blocks, block, key) => entriesOf(text, blocks, block).find((e) => e.key === key);

/** Whether the trigger a block is in runs when the mission starts. */
function atStart(blocks, b) {
  for (let p = b.parent; p !== null; p = blocks[p].parent) {
    const events = blocks.find((x) => x.parent === p && x.name === 'events');
    if (events) return blocks.some((x) => x.parent === blocks.indexOf(events) && x.name === 'initMission');
  }
  return false;
}

/**
 * The varSetInt actions in triggers that set `name`: their value entries.
 * For the countdown, only the mission start's (firstCountdown) or only the
 * others (countdown).
 */
function varSets(text, blocks, name, key = null) {
  return blocks
    .filter((b) => b.name === 'varSetInt' && insideTriggers(blocks, b))
    .filter((b) => (key === 'firstCountdown' ? atStart(blocks, b) : key === 'countdown' ? !atStart(blocks, b) : true))
    .map((b) => {
      const entries = entriesOf(text, blocks, b);
      const v = entries.find((e) => e.key === 'var');
      return v && decode('t', v.raw) === name ? entries.find((e) => e.key === 'value') : null;
    })
    .filter(Boolean);
}

function triggerBlock(blocks, name, within = null) {
  return blocks.find((b) => b.name === name && insideTriggers(blocks, b) && (within === null || isInside(blocks, b, within)));
}
function isInside(blocks, b, ancestor) {
  const target = blocks.indexOf(ancestor);
  for (let p = b.parent; p !== null; p = blocks[p].parent) if (p === target) return true;
  return false;
}

/** tm:m=[[..] [..] [..] [x, y, z]] → { rows: number[][], entry }, or null. */
function matrixOf(text, blocks, block) {
  const e = entryOf(text, blocks, block, 'tm');
  if (!e || e.type !== 'm') return null;
  const tokens = [...e.raw.matchAll(/\[([^\[\]]*)\]/g)].map((m) => m[1].split(',').map((x) => x.trim()));
  const rows = tokens.map((r) => r.map(Number));
  if (rows.length !== 4 || rows.some((r) => r.length !== 3 || r.some((n) => !Number.isFinite(n)))) return null;
  return { rows, tokens, entry: e };
}
const num = (n) => String(Math.round(n * 1000) / 1000);
/** The matrix with `rows`; numbers that didn't change keep their text (e.g. 2.38339e-07). */
const matrixText = (m, rows) => `[${rows.map((r, i) => `[${r.map((n, j) => (n === m.rows[i][j] ? m.tokens[i][j] : num(n))).join(', ')}]`).join(' ')}]`;

function spawnAreas(text, blocks) {
  const areas = blocks.find((b) => b.depth === 0 && b.name === 'areas');
  if (!areas) return [];
  const own = blocks.indexOf(areas);
  return blocks
    .filter((b) => b.parent === own && SPAWN.test(b.name))
    .map((b) => ({ team: Number(SPAWN.exec(b.name)[1]), m: matrixOf(text, blocks, b) }))
    .filter((a) => a.m);
}
const areaNamed = (text, blocks, name) => {
  const b = findPath(blocks, ['areas', name]);
  return b ? matrixOf(text, blocks, b) : null;
};
const centre = (list) => list.reduce((a, s) => [a[0] + s.m.rows[3][0] / list.length, a[1] + s.m.rows[3][2] / list.length], [0, 0]);

/**
 * The duel template's settings in a file: { firstCountdown, countdown, shootingDelay,
 * forfeitAfter, firstHit, bailoutDelay, spawnAltitude, spawnDistance,
 * areaRadius }, each null when the file has no such thing; null when it has
 * none at all.
 */
export function duelSettings(text) {
  if (missionProblems(text).length) return null;
  const { blocks } = scanBlocks(text);
  const out = Object.fromEntries(Object.keys(DUEL_FIELDS).map((k) => [k, null]));
  for (const [key, name] of Object.entries(DUEL_VARS)) {
    const sets = varSets(text, blocks, name, key);
    if (sets.length) out[key] = decode('i', sets[0].raw);
  }
  const group = triggerBlock(blocks, FIRST_HIT);
  if (group) {
    const on = entryOf(text, blocks, group, 'is_enabled');
    out.firstHit = on ? decode('b', on.raw) : true;
    const hitTimer = triggerBlock(blocks, 'hit_timer', group);
    const wait = hitTimer && blocks.find((b) => b.name === 'wait' && isInside(blocks, b, hitTimer));
    const time = wait && entryOf(text, blocks, wait, 'time');
    if (time) out.bailoutDelay = decode('r', time.raw);
  }
  const spawns = spawnAreas(text, blocks);
  if (spawns.some((s) => s.team === 1) && spawns.some((s) => s.team === 2)) {
    out.spawnAltitude = Math.round(spawns[0].m.rows[3][1]);
    const [a, b] = [1, 2].map((t) => centre(spawns.filter((s) => s.team === t)));
    out.spawnDistance = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const area = areaNamed(text, blocks, 'battle_area_01');
  if (area) out.areaRadius = Math.round(area.rows[0][0]);
  return Object.values(out).some((v) => v !== null) ? out : null;
}

function checkDuel(key, value) {
  const spec = DUEL_FIELDS[key];
  if (!spec) throw new Error(`不能修改 ${key}`);
  if (spec.type === 'b') return Boolean(value);
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n)) throw new Error('决斗规则里的数值必须是数字');
  if (spec.type === 'i' && !Number.isInteger(n)) throw new Error('决斗规则里的秒数必须是整数');
  if (n < spec.min || n > spec.max) throw new Error(`决斗规则的数值要在 ${spec.min}-${spec.max} 之间`);
  return n;
}

/** Replaces [start, end, text] ranges (not overlapping) in one pass. */
function replaceRanges(text, reps) {
  let out = text;
  for (const [a, b, s] of [...reps].sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + s + out.slice(b);
  return out;
}

function setDuel(text, duel) {
  const now = duelSettings(text) || {};
  let out = text;
  // One setting at a time (spawn altitude and distance change the same lines).
  for (const [key, raw] of Object.entries(duel)) {
    if (raw === undefined) continue;
    if (now[key] === null || now[key] === undefined) throw new Error(`这个地图没有「${key}」这项决斗规则`);
    out = setDuelOne(out, key, checkDuel(key, raw));
  }
  return out;
}

function setDuelOne(text, key, value) {
  const { blocks } = scanBlocks(text);
  const reps = [];
  {
    if (key in DUEL_VARS) {
      for (const e of varSets(text, blocks, DUEL_VARS[key], key)) reps.push([e.valueStart, e.valueEnd, encode('i', value)]);
    } else if (key === 'firstHit') {
      const group = triggerBlock(blocks, FIRST_HIT);
      for (const b of [group, ...FIRST_HIT_TRIGGERS.map((n) => triggerBlock(blocks, n, group))]) {
        const e = b && entryOf(text, blocks, b, 'is_enabled');
        if (e) reps.push([e.valueStart, e.valueEnd, encode('b', value)]);
        else if (b) {
          // No is_enabled line (on by default): add one after "name{".
          const eol = text.indexOf('\n', b.open);
          const indent = entriesOf(text, blocks, b)[0]?.indent ?? '  '.repeat(b.depth + 1);
          const nl = text.includes('\r\n') ? '\r\n' : '\n';
          reps.push([eol + 1, eol + 1, `${indent}is_enabled:b=${encode('b', value)}${nl}`]);
        }
      }
    } else if (key === 'bailoutDelay') {
      const hitTimer = triggerBlock(blocks, 'hit_timer', triggerBlock(blocks, FIRST_HIT));
      for (const w of blocks.filter((b) => b.name === 'wait' && isInside(blocks, b, hitTimer))) {
        const e = entryOf(text, blocks, w, 'time');
        if (e) reps.push([e.valueStart, e.valueEnd, num(value)]);
      }
    } else if (key === 'spawnAltitude' || key === 'spawnDistance') {
      const spawns = spawnAreas(text, blocks);
      const [a, b] = [1, 2].map((t) => centre(spawns.filter((s) => s.team === t)));
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // Each team moves half the change, along the line between them.
      const shift = key === 'spawnDistance' && d > 0 ? (value - d) / 2 : 0;
      const dir = d > 0 ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d] : [0, 0];
      for (const s of spawns) {
        const rows = s.m.rows.map((r) => [...r]);
        if (key === 'spawnAltitude') rows[3][1] = value;
        else {
          const sign = s.team === 1 ? -1 : 1;
          rows[3][0] += sign * dir[0] * shift;
          rows[3][2] += sign * dir[1] * shift;
        }
        reps.push([s.m.entry.valueStart, s.m.entry.valueEnd, matrixText(s.m, rows)]);
      }
    } else if (key === 'areaRadius') {
      // The battle area's radius; the kill border (battle_area_destr_01)
      // keeps its distance outside it.
      const area = areaNamed(text, blocks, 'battle_area_01');
      const old = area.rows[0][0];
      for (const [name, r] of [['battle_area_01', value], ['battle_area_destr_01', null]]) {
        const m = name === 'battle_area_01' ? area : areaNamed(text, blocks, name);
        if (!m) continue;
        const radius = r ?? m.rows[0][0] + (value - old);
        const rows = m.rows.map((row) => [...row]);
        rows[0][0] = radius;
        rows[2][2] = radius;
        reps.push([m.entry.valueStart, m.entry.valueEnd, matrixText(m, rows)]);
      }
    }
  }
  return replaceRanges(text, reps);
}

/** "levels/air_africa_desert.bin" → "air_africa_desert". */
export const levelName = (level) => String(level || '').replace(/^.*\//, '').replace(/\.bin$/, '');

function checkField(key, value) {
  const spec = MISSION_FIELDS[key];
  if (!spec) throw new Error(`不能修改 ${key}`);
  if (spec.type === 't') {
    const s = String(value ?? '');
    if (/["\n\r~]/.test(s)) throw new Error(`${key} 不能包含引号、波浪号或换行`);
    if (spec.max && s.length > spec.max) throw new Error(`${key} 太长（最多 ${spec.max} 字）`);
    if (spec.pattern && !spec.pattern.test(s)) throw new Error(`${key} 只能用英文字母、数字和下划线`);
    return s;
  }
  if (spec.type === 'b') return Boolean(value);
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n)) throw new Error(`${key} 必须是数字`);
  if (spec.type === 'i' && !Number.isInteger(n)) throw new Error(`${key} 必须是整数`);
  if (n < spec.min || n > spec.max) throw new Error(`${key} 要在 ${spec.min}-${spec.max} 之间`);
  return n;
}

function setField(text, key, value) {
  const { blocks } = scanBlocks(text);
  const mission = findPath(blocks, MISSION_PATH);
  const spec = MISSION_FIELDS[key];
  const entries = entriesOf(text, blocks, mission);
  const e = entries.find((x) => x.key === key);
  const encoded = encode(spec.type, value);
  if (e) {
    if (e.type !== spec.type && !(spec.type === 'r' && e.type === 'i')) throw new Error(`${key} 在文件里的类型是 ${e.type}，不能改`);
    return text.slice(0, e.valueStart) + encoded + text.slice(e.valueEnd);
  }
  // Not there yet: a new line right after "mission{".
  const indent = entries[0]?.indent ?? '  '.repeat(mission.depth + 1);
  const eol = text.indexOf('\n', mission.open);
  const at = eol < 0 || eol > mission.close ? mission.open + 1 : eol + 1;
  const prefix = at === mission.open + 1 ? '\n' : '';
  return `${text.slice(0, at)}${prefix}${indent}${key}:${spec.type}=${encoded}\n${text.slice(at)}`;
}

function setUnits(text, team, units) {
  if (!units.length) throw new Error('限制载具时至少要有一个载具（不想限制就关掉「限制载具」）');
  const { blocks } = scanBlocks(text);
  const list = findPath(blocks, UNITS_PATH(team));
  if (!list) throw new Error('这个地图没有载具列表（customRules → teams → unlimitedUnits），只能改原文');
  const old = entriesOf(text, blocks, list);
  const indent = old[0]?.indent ?? '  '.repeat(list.depth + 1);
  const lineStart = text.lastIndexOf('\n', list.close) + 1;
  const closeIndent = /^[ \t]*$/.test(text.slice(lineStart, list.close)) ? text.slice(lineStart, list.close) : '  '.repeat(list.depth);
  const body = units.map((u) => `\n${indent}${u}:b=yes`).join('') + `\n${closeIndent}`;
  return text.slice(0, list.open + 1) + body + text.slice(list.close);
}

/** The customRules block's whole lines (to put back later), or null. */
export function vehicleLimitBlock(text) {
  if (missionProblems(text).length) return null;
  const { blocks } = scanBlocks(text);
  const rules = findPath(blocks, RULES_PATH);
  if (!rules) return null;
  const from = text.lastIndexOf('\n', rules.start) + 1;
  const eol = text.indexOf('\n', rules.close);
  const block = text.slice(from, eol < 0 ? text.length : eol + 1);
  return block.endsWith('\n') ? block : `${block}\n`;
}

function removeVehicleLimit(text) {
  const { blocks } = scanBlocks(text);
  const rules = findPath(blocks, RULES_PATH);
  if (!rules) return text;
  const from = text.lastIndexOf('\n', rules.start) + 1;
  const eol = text.indexOf('\n', rules.close);
  return text.slice(0, from) + text.slice(eol < 0 ? text.length : eol + 1);
}

/** A new sharedPool rule (both teams may take `units`), indented like mission{}'s entries. */
function newVehicleLimit(indent, units) {
  const i = (n) => indent + '  '.repeat(n);
  const team = (name) => [`${i(2)}${name}{`, `${i(3)}unlimitedUnits{`, ...units.map((u) => `${i(4)}${u}:b=yes`), `${i(3)}}`, `${i(2)}}`];
  return [`${i(0)}customRules{`, `${i(1)}name:t="sharedPool"`, `${i(1)}teams{`, ...team('teamA'), ...team('teamB'), `${i(1)}}`, `${i(0)}}`, ''].join('\n');
}

function addVehicleLimit(text, block, units) {
  const { blocks } = scanBlocks(text);
  if (findPath(blocks, RULES_PATH)) return text;
  const mission = findPath(blocks, MISSION_PATH);
  if (!block) {
    if (!units?.length) throw new Error('请填写可用的载具');
    const indent = entriesOf(text, blocks, mission)[0]?.indent ?? '  '.repeat(mission.depth + 1);
    block = newVehicleLimit(indent, units);
  }
  const eol = text.indexOf('\n', mission.open);
  if (eol < 0 || eol > mission.close) return `${text.slice(0, mission.open + 1)}\n${block}${text.slice(mission.open + 1)}`;
  return text.slice(0, eol + 1) + block + text.slice(eol + 1);
}

/** Vehicle ids from text: one per line or separated by commas / spaces; checked, no repeats. */
export function parseUnitList(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/[\s,，、]+/);
  const out = [];
  for (const raw of list) {
    const u = String(raw).trim();
    if (!u) continue;
    if (!UNIT_ID.test(u)) throw new Error(`载具 ID「${u.slice(0, 40)}」不对：只能用英文字母、数字、下划线、点和横线`);
    if (!out.includes(u)) out.push(u);
  }
  if (out.length > 500) throw new Error('载具太多（最多 500 个）');
  return out;
}

/**
 * The text with `fields` ({ scoreLimit: 3, ... }), `units` ({ teamA:
 * [...], teamB: [...] }), the vehicle limit (on / off) and the duel
 * template's settings (`duel`: { shootingDelay: 20, ... }) changed in place.
 * Throws a message for people.
 */
export function applyMissionEdits(text, { fields = {}, units = null, vehicleLimit = undefined, limitBlock = null, duel = null } = {}) {
  const problems = missionProblems(text);
  if (problems.length) throw new Error(problems[0]);
  let out = text;
  // vehicleLimit false: remove the customRules block; true: put `limitBlock`
  // back (an older version's), or a new one with `units` (team A's list).
  if (vehicleLimit === false) {
    out = removeVehicleLimit(out);
    units = null;
  } else if (vehicleLimit === true && !missionSummary(out).vehicleLimit) {
    out = addVehicleLimit(out, limitBlock, units ? parseUnitList(units.teamA ?? []) : null);
  }
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined) continue;
    out = setField(out, key, checkField(key, value));
  }
  if (units) {
    for (const team of TEAMS) {
      if (units[team] === undefined) continue;
      out = setUnits(out, team, parseUnitList(units[team]));
    }
  }
  if (duel && Object.keys(duel).length) out = setDuel(out, duel);
  const after = missionProblems(out);
  if (after.length) throw new Error(after[0]);
  return out;
}
