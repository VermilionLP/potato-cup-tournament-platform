// Potato Cup points (积分榜) and prizes: an event's table per placing,
// [{ from, to, points, prize? }] (prize: Golden Eagles, 金鹰币), the points
// counted towards a season (year) leaderboard.

// Presets double as the kind of points event: 周赛 (weekly) or 大型赛事
// (id "monthly", formerly 月赛), whose champion is invited to the Winter
// Finals by default.
export const POINTS_PRESETS = [
  {
    id: "weekly",
    label: "周赛",
    table: [
      { from: 1, to: 1, points: 100, prize: 2500 },
      { from: 2, to: 2, points: 60, prize: 1000 },
      { from: 3, to: 4, points: 35, prize: 150 },
      { from: 5, to: 8, points: 10 },
    ],
  },
  {
    id: "monthly",
    label: "大型赛事",
    table: [
      { from: 1, to: 1, points: 300, prize: 10000 },
      { from: 2, to: 2, points: 180, prize: 5000 },
      { from: 3, to: 3, points: 100, prize: 2500 },
      { from: 4, to: 4, points: 75, prize: 2000 },
      { from: 5, to: 6, points: 55, prize: 1000 },
      { from: 7, to: 8, points: 35, prize: 1000 },
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
    .map((r) => ({ from: Number(r.from), to: r.to === "" || r.to == null ? Number(r.from) : Number(r.to), points: Number(r.points), prize: prizeValue(r.prize) }))
    .sort((a, b) => a.from - b.from);
  for (const [i, r] of rows.entries()) {
    if (!Number.isInteger(r.from) || r.from < 1) return `第 ${i + 1} 行的名次不正确`;
    if (!Number.isInteger(r.to) || r.to < r.from) return `第 ${i + 1} 行的名次范围不正确`;
    if (!Number.isFinite(r.points) || r.points < 0) return `第 ${i + 1} 行的积分不正确`;
    if (r.prize !== null && (!Number.isInteger(r.prize) || r.prize < 0)) return `第 ${i + 1} 行的金鹰币不正确`;
    if (i && r.from <= rows[i - 1].to) return `名次 ${r.from} 重复了`;
  }
  return "";
}

/** Table ready to send: numbers, sorted. */
export function cleanTable(table) {
  return (table || [])
    .map((r) => {
      const row = { from: Number(r.from), to: r.to === "" || r.to == null ? Number(r.from) : Number(r.to), points: Number(r.points) };
      const prize = prizeValue(r.prize);
      return prize ? { ...row, prize } : row;
    })
    .sort((a, b) => a.from - b.from);
}

/** A prize cell: a whole number of Golden Eagles, null when empty (NaN when not a number). */
export function prizeValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** "冠军" / "亚军" / "季军" / "第 3-4 名" for a table row. */
export function placeName(row) {
  if (row.from === row.to) return row.from === 1 ? "冠军" : row.from === 2 ? "亚军" : row.from === 3 ? "季军" : `第 ${row.from} 名`;
  return `第 ${row.from}-${row.to} 名`;
}

/** Rows with a prize, and the prize pool (each place in a range gets the prize). */
export function prizeRows(table = []) {
  return (table || []).filter((r) => Number(r.prize) > 0);
}
export function prizeTotal(table = []) {
  return prizeRows(table).reduce((n, r) => n + Number(r.prize) * (Number(r.to) - Number(r.from) + 1), 0);
}

/**
 * Cell colour for a placing, as on Liquipedia's point standings: gold 1st,
 * slate 2nd, bronze 3rd (or 3rd-4th), orange 4th, teal 5th-8th, dark teal
 * after that. Returns a CSS background colour.
 */
export function placeColor(place) {
  if (!place) return "";
  if (place.from === 1) return "#c9a800";
  if (place.from === 2) return "#5a6e78";
  if (place.from === 3) return "#806c4a";
  if (place.from === 4) return "#cc7a14";
  if (place.from <= 8) return "#26a69a";
  return "#1f7a72";
}
