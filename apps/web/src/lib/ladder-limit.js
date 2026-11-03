// Ladder limit of an event (the API's lib/ladder-limit.js): players may sign
// up themselves only up to a ladder MMR or a league, in the event's own
// division; unrated and provisional players can't. Admins add anyone.
//
// In forms the limit is one choice: "" (none), "mmr" (with a number) or a
// league group ("gold" = gold and below).

export const LIMIT_TIERS = [
  { group: "bronze", name: "青铜" },
  { group: "silver", name: "白银" },
  { group: "gold", name: "黄金" },
  { group: "platinum", name: "白金" },
  { group: "diamond", name: "钻石" },
  { group: "master", name: "大师" },
];

export const DEFAULT_LIMIT_MMR = 3300;

const tierName = (group) => LIMIT_TIERS.find((t) => t.group === group)?.name || group;

/** The form choice for event `t`. */
export const limitChoice = (t) => (t?.ladder_max_mmr != null ? "mmr" : t?.ladder_max_tier || "");

/** API fields for a form choice. */
export function limitFields(choice, mmr) {
  if (choice === "mmr") return { ladder_max_mmr: Number(mmr), ladder_max_tier: null };
  return { ladder_max_mmr: null, ladder_max_tier: choice || null };
}

/** "天梯分 ≤ 3300" / "黄金及以下"; "" without a limit. */
export function ladderLimitLabel(t) {
  if (t?.ladder_max_mmr != null) return `天梯分 ≤ ${t.ladder_max_mmr}`;
  if (t?.ladder_max_tier) return `${tierName(t.ladder_max_tier)}及以下`;
  return "";
}

/** A problem with the form choice, or "". */
export function limitProblem(choice, mmr) {
  if (choice !== "mmr") return "";
  const n = Number(mmr);
  return Number.isInteger(n) && n >= 1000 && n <= 9999 ? "" : "天梯分上限必须是 1000-9999 之间的整数";
}
