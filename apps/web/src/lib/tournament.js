// Tournament metadata labels shared by the home page and the tournament page.

export const GAME_MODES = [
  { id: "ab", code: "AB", name: "街机模式", full: "Arcade" },
  { id: "rb", code: "RB", name: "历史模式", full: "Realistic" },
  { id: "sb", code: "SB", name: "全真模式", full: "Simulator" },
];

export const BRACKET_FORMATS = [
  { id: "single_elim", label: "单败淘汰", available: true },
  { id: "double_elim", label: "双败淘汰", available: true },
  { id: "swiss", label: "瑞士轮", available: true },
];

export function gameModeInfo(value) {
  return GAME_MODES.find((mode) => mode.id === value) || GAME_MODES[1];
}

/** "RB": the mode code alone ("RB" already means 历史模式). */
export function gameModeLabel(value) {
  return gameModeInfo(value).code;
}

/** Tooltip for a mode code: "历史模式 · Realistic". */
export function gameModeTitle(value) {
  const mode = gameModeInfo(value);
  return `${mode.name} · ${mode.full}`;
}

// Vehicle pools (line-ups) events are grouped by.
export const VEHICLE_POOLS = [
  { id: "prop", code: "Prop", name: "螺旋桨" },
  { id: "legacy-jet", code: "Legacy Jet", name: "早期喷气" },
  { id: "proleague", code: "BVR", name: "Pro League BVR" },
];

// Tag colours per event type, so the type can be spotted at a glance.
export const POOL_TAG = {
  prop: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "legacy-jet": "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  proleague: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

/** "螺旋桨" / "早期喷气" / "Pro League BVR"; '' for an unknown pool. */
export function vehiclePoolLabel(value) {
  return VEHICLE_POOLS.find((pool) => pool.id === value)?.name || "";
}

export function formatLabel(value) {
  return BRACKET_FORMATS.find((format) => format.id === value)?.label || "单败淘汰";
}

export function advancementLabel(loserAdvances) {
  return loserAdvances ? "败者晋级" : "胜者晋级";
}

// Mirrors MIN_PLAYERS_BY_FORMAT in apps/api/lib/tournament-config.js; the
// server enforces it, this copy only drives the UI.
export const MIN_PLAYERS_BY_FORMAT = { single_elim: 2, double_elim: 4, swiss: 2 };

export function minPlayersForFormat(format) {
  return MIN_PLAYERS_BY_FORMAT[format] ?? MIN_PLAYERS_BY_FORMAT.single_elim;
}

// An admin can correct a match that already has a result (score or walkover)
// as long as both slots hold a real player; byes and voided slots are skipped.
export function canCorrectResult(match) {
  return Boolean(
    match &&
      match.status !== "pending" &&
      match.player1_id &&
      match.player2_id,
  );
}

// Mirrors apps/api/lib/swiss.js.
export const MIN_SWISS_ROUNDS = 1;
export const MAX_SWISS_ROUNDS = 15;

export function suggestedSwissRounds(playerCount) {
  const n = Number(playerCount) || 0;
  return n < 2 ? 1 : Math.max(1, Math.ceil(Math.log2(n)));
}

/** Rounds for everyone to meet everyone once (odd fields: everyone sits out once). */
export function roundRobinRounds(playerCount) {
  const n = Number(playerCount) || 0;
  if (n < 2) return 1;
  return n % 2 === 0 ? n - 1 : n;
}

/** Empty round count = automatic (a full round robin). */
export function isAutoRounds(value) {
  return value === null || value === undefined || value === "" || value === "auto";
}

/** Automatic round count for a group of `playerCount`, capped like the server. */
export function autoSwissRounds(playerCount) {
  return Math.min(MAX_SWISS_ROUNDS, roundRobinRounds(playerCount));
}

export function isValidSwissRounds(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_SWISS_ROUNDS && n <= MAX_SWISS_ROUNDS;
}

/** Why the start button is disabled, or null when the tournament can start. */
export function startBlockedMessage(format, playerCount, swissRounds = null, twoStage = null) {
  const min = minPlayersForFormat(format);
  const count = Number(playerCount) || 0;
  if (count < min) return `至少 ${min} 人才能开赛（当前 ${count} 人）`;
  if (twoStage?.playoffFormat) {
    if (format === "swiss") return twoStageStartMessage(count, { rounds: swissRounds, ...twoStage });
    return eliminationGroupsStartMessage(count, { format, ...twoStage });
  }
  if (format === "swiss" && !isAutoRounds(swissRounds)) {
    if (!isValidSwissRounds(swissRounds)) return "请先设置瑞士轮轮数";
    if (swissRounds > roundRobinRounds(count)) {
      const need = swissRounds % 2 === 0 ? swissRounds + 1 : swissRounds;
      return `${swissRounds} 轮瑞士轮至少需要 ${need} 人（当前 ${count} 人）`;
    }
  }
  return null;
}

/**
 * Who wins and who moves on for a score, mirroring the server: the higher
 * score wins; in single elimination with "loser advances" the loser moves on.
 * Returns { tie, winner, advancer } with slots 1 / 2 (null on a tie).
 */
export function scoreOutcome(score1, score2, { format = "single_elim", loserAdvances = false } = {}) {
  const s1 = Number(score1) || 0;
  const s2 = Number(score2) || 0;
  if (s1 === s2) return { tie: true, winner: null, advancer: null };
  const winner = s1 > s2 ? 1 : 2;
  const flipped = format === "single_elim" && Boolean(loserAdvances);
  return { tie: false, winner, advancer: flipped ? 3 - winner : winner };
}

// Common results offered as one-tap presets in the score form.
export const SCORE_PRESETS = [
  [1, 0],
  [2, 0],
  [2, 1],
  [1, 2],
  [0, 2],
  [0, 1],
];

// Two-stage events (group stage + playoff). Mirrors apps/api/lib/group-stage.js
// and apps/api/lib/group-brackets.js. For a two-stage event `format` is the
// group-stage format and `playoff_format` the playoff.
export const PLAYOFF_FORMATS = [
  { id: "single_elim", label: "单败淘汰" },
  { id: "double_elim", label: "双败淘汰" },
];

export const GROUP_FORMATS = [
  { id: "swiss", label: "瑞士轮", hint: "组内积分制，默认单循环" },
  { id: "single_elim", label: "单败", hint: "整组打完，按名次取前 K" },
  { id: "double_elim", label: "双败", hint: "胜者组、败者组各出一半，组内无总决赛" },
];

// Match codes of the group stage (Swiss rounds and group brackets).
export const GROUP_STAGE_BRACKETS = ["sw", "gse", "gwb", "glb"];

/** "双败小组 → 单败淘汰" for two-stage events, the plain format otherwise. */
export function eventFormatLabel(t) {
  if (!t?.playoff_format) return formatLabel(t?.format);
  const group = GROUP_FORMATS.find((f) => f.id === t.format)?.label || "瑞士轮";
  return `${group}小组 → ${formatLabel(t.playoff_format)}`;
}

const isPow2 = (n) => Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;

/** Why a group of `size` cannot play this elimination format with `perGroup` qualifiers, or null. */
export function groupBracketProblem(format, size, perGroup) {
  const k = Number(perGroup) || 0;
  if (k < 1) return "请先设置每组晋级人数";
  if (k >= size) return `每组晋级 ${k} 人，但有的组只有 ${size} 人，无需比赛`;
  if (format !== "double_elim") return null;
  if (size < 3) return "双败小组每组至少需要 3 人";
  if (k < 2) return "双败小组每组至少晋级 2 人（胜者组、败者组各 1 人）；只晋级 1 人请用单败小组";
  const fromWinners = Math.ceil(k / 2);
  const fromLosers = Math.floor(k / 2);
  if (!isPow2(fromWinners) || !isPow2(fromLosers)) {
    return "双败小组的晋级人数需让胜者组、败者组各出 1、2、4… 人（每组晋级 2、3、4、8…）";
  }
  const slots = Math.max(4, 2 ** Math.ceil(Math.log2(size)));
  if (fromWinners > slots / 2) return `每组 ${slots} 个位置，胜者组最多出 ${slots / 2} 人`;
  const wbRounds = Math.log2(slots) - Math.log2(fromWinners);
  const losersLeft = wbRounds === 1 ? slots / 4 : fromWinners;
  if (fromLosers > losersLeft) return `每组 ${slots} 个位置，败者组最多出 ${losersLeft} 人`;
  return null;
}

/** Why a two-stage event with elimination groups cannot start yet, or null. */
export function eliminationGroupsStartMessage(playerCount, { format, groupSize, perGroup, playoffFormat }) {
  const count = Number(playerCount) || 0;
  const groups = groupCountFor(count, groupSize);
  for (const size of new Set([Math.floor(count / groups), Math.ceil(count / groups)])) {
    const problem = groupBracketProblem(format, size, perGroup);
    if (problem) return `分成 ${groups} 组（每组 ${size} 人）：${problem}`;
  }
  const total = groups * (Number(perGroup) || 0);
  const min = playoffFormat === "double_elim" ? 4 : 2;
  if (total < min) return `淘汰赛至少需要 ${min} 名晋级选手（当前 ${groups} 组 × ${perGroup} = ${total} 人）`;
  return null;
}

export function groupLabel(group) {
  return String.fromCharCode(64 + Number(group || 1));
}

export function groupCountFor(playerCount, groupSize) {
  const n = Number(playerCount) || 0;
  const size = Number(groupSize) || 0;
  if (!size || n <= 0) return 1;
  return Math.max(1, Math.ceil(n / size));
}

/** Why a two-stage event cannot start yet, or null. */
export function twoStageStartMessage(playerCount, { rounds, groupSize, perGroup, playoffFormat }) {
  const count = Number(playerCount) || 0;
  const auto = isAutoRounds(rounds);
  if (!auto && !isValidSwissRounds(rounds)) return "请先设置瑞士轮轮数";
  const groups = groupCountFor(count, groupSize);
  const smallest = Math.floor(count / groups);
  if (smallest < 2) return `分成 ${groups} 组后每组不足 2 人（当前 ${count} 人）`;
  if (!auto && rounds > roundRobinRounds(smallest)) {
    return `最小的组只有 ${smallest} 人，最多打 ${roundRobinRounds(smallest)} 轮（当前 ${rounds} 轮）`;
  }
  const k = Number(perGroup) || 0;
  if (k < 1) return "请先设置每组晋级人数";
  if (k > smallest) return `每组晋级 ${k} 人，但最小的组只有 ${smallest} 人`;
  const total = groups * k;
  const min = playoffFormat === "double_elim" ? 4 : 2;
  if (total < min) return `淘汰赛至少需要 ${min} 名晋级选手（当前 ${groups} 组 × ${k} = ${total} 人）`;
  return null;
}

/**
 * Short labels for an event card or header: the mode code, the event type,
 * the format (with Swiss rounds) and one optional detail - the group setup
 * of two-stage events, or 败者晋级 (胜者晋级 is the norm and not shown).
 */
export function eventSummary(t) {
  const rounds = t?.swiss_rounds ? `${t.swiss_rounds} 轮` : "单循环";
  let format = eventFormatLabel(t);
  let detail = "";
  if (t?.playoff_format) {
    const parts = [t?.swiss_group_size ? `每组 ${t.swiss_group_size} 人` : "不分组"];
    if (t.format === "swiss") parts.push(rounds);
    parts.push(`每组前 ${t.advance_per_group} 名晋级`);
    detail = parts.join(" · ");
  } else if (t?.format === "swiss") {
    format = `瑞士轮 · ${rounds}`;
  } else if (t?.loser_advances) {
    detail = "败者晋级";
  }
  return {
    mode: gameModeLabel(t?.game_mode),
    modeTitle: gameModeTitle(t?.game_mode),
    pool: vehiclePoolLabel(t?.vehicle_pool),
    format,
    detail,
  };
}
