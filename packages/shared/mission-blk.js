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
  return { name: get('name'), level: get('level'), type: get('type'), unitTypes, fields, units, vehicleLimit: Boolean(units) };
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
 * [...], teamB: [...] }) and the vehicle limit (on / off) changed in place.
 * Throws a message for people.
 */
export function applyMissionEdits(text, { fields = {}, units = null, vehicleLimit = undefined, limitBlock = null } = {}) {
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
  const after = missionProblems(out);
  if (after.length) throw new Error(after[0]);
  return out;
}
