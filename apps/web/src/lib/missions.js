// 比赛地图 (War Thunder mission files) on the page: the link players paste
// into custom battles, and what a mission's settings say, in words. The
// file's rules (reading, checking, editing) are @potato-cup/shared/mission-blk.js.

import { ENVIRONMENTS, levelName, WEATHERS } from "@potato-cup/shared/mission-blk.js";

export { ENVIRONMENTS, WEATHERS };

// The game's names for them (its Chinese menu; the English one comes from
// the translations). Hazy and Mist are both 薄雾 in the game's Chinese.
const WEATHER_LABELS = {
  clear: "晴朗", good: "局部多云", hazy: "薄雾（Hazy）", mist: "薄雾（Mist）", thin_clouds: "薄云", cloudy_windy: "雷暴云",
  cloudy: "多云", overcast: "阴天", poor: "低云", blind: "浓雾", rain: "大雨", storm: "雷暴",
};
const TIME_LABELS = { Dawn: "黎明", Morning: "清晨", Noon: "正午", Day: "昼间", Evening: "傍晚", Dusk: "黄昏", Night: "夜间" };

/** "晴朗" for "clear"; an unknown value as it is. */
export const weatherLabel = (v) => WEATHER_LABELS[v] || String(v ?? "");
/** "正午" for "Noon", "7:00" for "7"; an unknown value as it is. */
export const timeLabel = (v) => TIME_LABELS[v] || (/^\d{1,2}$/.test(String(v)) ? `${v}:00` : String(v ?? ""));

/** Options for a menu: the game's, plus the file's own value when it is not one of them. */
export function menuOptions(values, label, current) {
  const out = values.map((value) => ({ value, label: label(value) }));
  if (current && !values.includes(current)) out.push({ value: current, label: `${current}（文件里的值）` });
  return out;
}

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
  if (f.environment) out.push(["时段", timeLabel(f.environment)]);
  if (f.weather) out.push(["天气", weatherLabel(f.weather)]);
  const lists = vehicleLists(summary);
  if (lists) out.push(["可用载具", lists.same ? `${lists.teamA.length} 种` : `${lists.teamA.length} / ${lists.teamB.length} 种`]);
  else out.push(["可用载具", "不限"]);
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

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1280;

/**
 * A picture file as a data URL for the server: as it is when small (PNG,
 * JPEG, WebP up to 1280 px wide and 1.5 MB), else scaled to 1280 px wide
 * as WebP (JPEG where the browser can't).
 */
export async function imageDataUrl(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("只支持 PNG、JPEG 和 WebP 图片");
  const asIs = () => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("读不出这张图片"));
    r.readAsDataURL(file);
  });
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("读不出这张图片");
  if (bitmap.width <= MAX_IMAGE_WIDTH && file.size <= MAX_IMAGE_BYTES) return asIs();
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", 0.86);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.86);
}
