// 比赛地图 (War Thunder mission files) on the page: the link players paste
// into custom battles, and what a mission's settings say, in words. The
// file's rules (reading, checking, editing) are @potato-cup/shared/mission-blk.js.

import { ENVIRONMENTS, levelName, WEATHERS } from "@potato-cup/shared/mission-blk.js";

export { ENVIRONMENTS, WEATHERS };

/**
 * The link for 自定义战斗 → Missions by URL. The game takes http:// links
 * only (an https:// one is refused), so it is http even on an https site.
 */
export function missionLink(id, host = typeof location !== "undefined" ? location.host : "") {
  return `http://${host}/api/missions/${encodeURIComponent(id)}.blk`;
}

/** The file to download (https on the site, so the browser does not warn). */
export const missionFile = (id, version = 0) => `/api/missions/${encodeURIComponent(id)}.blk${version ? `?v=${version}` : ""}`;

const UNIT_TYPES = [
  ["air", "空战"],
  ["helicopters", "直升机"],
  ["ground", "陆战"],
  ["naval", "海战"],
];

/** "空战", "陆战" … from allowedUnitTypes (empty when the file does not say). */
export function modeLabels(summary) {
  const t = summary?.unitTypes;
  if (!t) return [];
  return UNIT_TYPES.filter(([k]) => t[k]).map(([, label]) => label);
}

/** Vehicles both teams may take: { same, teamA, teamB } or null (no list in the file). */
export function vehicleLists(summary) {
  const u = summary?.units;
  if (!u) return null;
  const a = u.teamA || [];
  const b = u.teamB || [];
  const same = a.length === b.length && a.every((x, i) => x === b[i]);
  return { same, teamA: a, teamB: b };
}

/** Facts for a card: [[label, value]] (only the ones the file has). */
export function missionFacts(summary) {
  if (!summary) return [];
  const f = summary.fields || {};
  const out = [];
  if (summary.level) out.push(["场景", levelName(summary.level)]);
  if (f.scoreLimit != null) out.push(["得分上限", String(f.scoreLimit)]);
  if (f.timeLimit != null) out.push(["时限", `${f.timeLimit} 分钟`]);
  if (f.environment) out.push(["时段", f.environment]);
  if (f.weather) out.push(["天气", f.weather]);
  const lists = vehicleLists(summary);
  if (lists) out.push(["可用载具", lists.same ? `${lists.teamA.length} 种` : `${lists.teamA.length} / ${lists.teamB.length} 种`]);
  return out;
}

/** "86.6 KB". */
export const fileSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`);

/** Copies text; true when it worked. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
