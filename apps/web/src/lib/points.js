// Potato Cup points (积分榜): an event's points per placing,
// [{ from, to, points }], counted towards a season (year) leaderboard.

// Presets double as the kind of points event: a monthly (月赛) champion
// qualifies for the Winter Finals regardless of points.
export const POINTS_PRESETS = [
  {
    id: "weekly",
    label: "周赛",
    table: [
      { from: 1, to: 1, points: 100 },
      { from: 2, to: 2, points: 60 },
      { from: 3, to: 4, points: 35 },
      { from: 5, to: 8, points: 10 },
    ],
  },
  {
    id: "monthly",
    label: "月赛",
    table: [
      { from: 1, to: 1, points: 300 },
      { from: 2, to: 2, points: 180 },
      { from: 3, to: 3, points: 100 },
      { from: 4, to: 4, points: 75 },
      { from: 5, to: 6, points: 55 },
      { from: 7, to: 8, points: 35 },
      { from: 9, to: 12, points: 20 },
      { from: 13, to: 16, points: 10 },
    ],
  },
];

export const copyTable = (table) => (table || []).map((r) => ({ ...r }));

/** Current year in Beijing time, the default season. */
export function currentSeason(now = new Date()) {
  return new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(now);
}

/** "第 3 名" / "第 3-4 名". */
export function placeRangeLabel(row) {
  return row.from === row.to ? `第 ${row.from} 名` : `第 ${row.from}-${row.to} 名`;
}

/** First problem in a points table being edited, or "". */
export function pointsTableProblem(table, season) {
  if (!table?.length) return "积分表至少需要 1 行";
  if (!/^\d{4}$/.test(String(season ?? "").trim())) return "请填写积分榜赛季（年份，如 2026）";
  const rows = table
    .map((r) => ({ from: Number(r.from), to: r.to === "" || r.to == null ? Number(r.from) : Number(r.to), points: Number(r.points) }))
    .sort((a, b) => a.from - b.from);
  for (const [i, r] of rows.entries()) {
    if (!Number.isInteger(r.from) || r.from < 1) return `第 ${i + 1} 行的名次不正确`;
    if (!Number.isInteger(r.to) || r.to < r.from) return `第 ${i + 1} 行的名次范围不正确`;
    if (!Number.isFinite(r.points) || r.points < 0) return `第 ${i + 1} 行的积分不正确`;
    if (i && r.from <= rows[i - 1].to) return `名次 ${r.from} 重复了`;
  }
  return "";
}

/** Table ready to send: numbers, sorted. */
export function cleanTable(table) {
  return (table || [])
    .map((r) => ({ from: Number(r.from), to: r.to === "" || r.to == null ? Number(r.from) : Number(r.to), points: Number(r.points) }))
    .sort((a, b) => a.from - b.from);
}
