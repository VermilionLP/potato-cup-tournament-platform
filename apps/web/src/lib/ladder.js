const TIER_CLASSES = {
  grandmaster: "border-red-500/30 bg-red-500/10 text-red-400",
  master: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  diamond: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  platinum: "border-teal-500/30 bg-teal-500/10 text-teal-400",
  gold: "border-yellow-500/30 bg-yellow-500/10 text-yellow-500",
  silver: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300",
  bronze: "border-amber-700/40 bg-amber-700/10 text-amber-600",
  unrated: "border-border bg-muted/40 text-muted-foreground",
};

export function tierBadgeClass(group) {
  return TIER_CLASSES[group] || TIER_CLASSES.unrated;
}

export function formatWinRate(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

export function daysAgo(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  return `${diff} 天前`;
}


/**
 * Turn the API's newest-first history into an ascending chart series.
 * - game mode: x = 0..N (0 is the rating before the first game)
 * - time mode: x = played_at timestamp (all points, ascending)
 */
export function buildMmrSeries(history = [], mode = "time") {
  const ordered = [...history].reverse();
  if (ordered.length === 0) return [];

  if (mode === "game") {
    const start = ordered[0].mmr_before ?? 3000;
    return [
      { x: 0, y: start, label: "起点", meta: null },
      ...ordered.map((h, index) => ({
        x: index + 1,
        y: h.mmr_after,
        label: `第 ${index + 1} 场`,
        meta: h,
      })),
    ];
  }

  return ordered
    .map((h) => ({
      x: new Date(h.played_at).getTime(),
      y: h.mmr_after,
      label: h.played_at,
      meta: h,
    }))
    .filter((p) => Number.isFinite(p.x))
    .sort((a, b) => a.x - b.x);
}
