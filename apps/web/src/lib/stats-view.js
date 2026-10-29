// Display helpers of the statistics page: mode / event type colours,
// placings and avatar colours. Kept free of $lib imports except the
// constants so it can be tested with node --test.

import { GAME_MODES } from "./tournament.js";

// "第 3 名" / "第 5-8 名"; "" without a placing.
export const placeText = (p) => (!p ? "" : p.from === p.to ? `第 ${p.from} 名` : `第 ${p.from}-${p.to} 名`);
export const placeClass = (p) =>
  !p ? "" : p.from === 1 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
    : p.from === 2 ? "bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/30"
    : p.from === 3 ? "bg-orange-700/15 text-orange-700 dark:text-orange-400 border-orange-700/30"
    : "bg-muted/40 text-muted-foreground border-border/60";

// Game modes: AB / RB / SB; '' = no games yet.
export const getModeCode = (m) => GAME_MODES.find((x) => x.id === m)?.code ?? "—";
export const getModeName = (m) => {
  const mode = GAME_MODES.find((x) => x.id === m);
  return mode ? `${mode.code} ${mode.name}` : "暂无对局";
};
const MODE_COLORS = {
  ab: { badge: "bg-sky-500/10 text-sky-400 border-sky-500/25", dot: "bg-sky-500", bar: "bg-sky-500/80" },
  rb: { badge: "bg-amber-500/10 text-amber-500 border-amber-500/25", dot: "bg-amber-500", bar: "bg-amber-500/80" },
  sb: { badge: "bg-rose-500/10 text-rose-400 border-rose-500/25", dot: "bg-rose-500", bar: "bg-rose-500/80" },
};
const NO_MODE = { badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/25", dot: "bg-zinc-500", bar: "bg-zinc-500/80" };
export const modeColors = (m) => MODE_COLORS[m] ?? NO_MODE;
// Vehicle pools: 螺旋桨 / 早期喷气 / 顶级喷气 / Pro League BVR.
export const POOL_COLORS = {
  prop: { dot: "bg-lime-500", bar: "bg-lime-500/80" },
  "top-jet": { dot: "bg-rose-500", bar: "bg-rose-500/80" },
  "legacy-jet": { dot: "bg-violet-500", bar: "bg-violet-500/80" },
  proleague: { dot: "bg-cyan-500", bar: "bg-cyan-500/80" },
};

const avatarColors = [
  "from-amber-500 to-orange-500",
  "from-purple-500 to-indigo-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-fuchsia-500",
];

/** Avatar gradient of a player id (stable). */
export function getGradient(id) {
  let s = 0;
  for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
  return avatarColors[s % avatarColors.length];
}
