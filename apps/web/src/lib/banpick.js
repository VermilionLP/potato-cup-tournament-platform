// Ban / Pick on the website. The rules and transitions are shared with the
// server (@potato-cup/shared/banpick.js); this adds what only the pages
// need: the log in words and picking the newer of two server records.

export {
  ACTIONS,
  DEFAULT_RULES,
  DEFAULT_RULES as DEFAULT_BP_RULES,
  availableGroups,
  availableVehicles,
  banTurn,
  bannedBy,
  bansOf,
  canConfirm,
  effectiveEntries,
  effectiveEntries as effectiveLog,
  groupVehicles,
  initialBanPick,
  isGroupBanned,
  localAct,
  mayAct,
  normalizeRules,
  rerollsLeft,
  resultLabel,
  rulesSummary,
} from "@potato-cup/shared/banpick.js";

const ACTION_TEXT = {
  ban: (e) => `禁用 ${e.group}`,
  pass: () => "放弃禁用",
  drawGroup: (e) => `抽到大组 ${e.group}`,
  removeGroup: (e) => `移出大组 ${e.group}`,
  confirmGroup: (e) => `使用大组 ${e.group}`,
  backToGroups: () => "返回大组重新抽取",
  drawVehicle: (e) => `抽到载具 ${e.vehicle}`,
  removeVehicle: (e) => `移出载具 ${e.vehicle}`,
  confirm: (e) => `确认结果：${e.vehicle || `${e.group}（组内任选）`}`,
  reset: () => "重置 Ban/Pick",
};

/** What a server log entry did, in words ("禁用 GA", "撤销：抽到大组 GB"). */
export function logText(entry) {
  if (entry.action === "undo") {
    const inner = ACTION_TEXT[entry.undoneAction];
    return `撤销：${inner ? inner(entry) : "上一步"}`;
  }
  return ACTION_TEXT[entry.action]?.(entry) || entry.action;
}

/** Who did it: 管理员, or the player's name (with their side for bans). */
export function logWho(entry, nameOf = (id) => id) {
  return entry.by === "admin" ? "管理员" : nameOf(entry.by) || entry.by;
}

/** The newer of two server records (by rev); null when neither exists. */
export function newerRecord(a, b) {
  if (!a?.state) return b?.state ? b : null;
  if (!b?.state) return a;
  return b.rev > a.rev ? b : a;
}
