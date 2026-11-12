// The header search (SiteSearch.svelte): players, events and pages matched
// against what was typed, best matches first. Pure.

/** Lower case, no spaces / underscores / dashes, for comparing names. */
export function fold(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s_\-·.]+/g, "");
}

/**
 * How well `name` matches the folded query: 0 exact, 1 starts with it,
 * 2 a word starts with it, 3 contains it, -1 no match.
 */
export function matchScore(name, query) {
  const q = fold(query);
  if (!q) return -1;
  const n = fold(name);
  if (!n) return -1;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const words = String(name).toLowerCase().split(/[\s_\-·.#]+/).filter(Boolean);
  if (words.some((w) => fold(w).startsWith(q))) return 2;
  // Inside a name only as typed (folding would join words: "live-rm" has no "ver").
  return String(name).toLowerCase().includes(String(query).trim().toLowerCase()) ? 3 : -1;
}

// Pages people look for by name (Chinese and English words).
export const PAGES = [
  { href: "/", label: "赛事大厅", words: ["赛事", "大厅", "lobby", "events", "home"] },
  { href: "/me", label: "我的", words: ["我的", "个人", "me", "my", "profile"] },
  { href: "/players", label: "选手列表", words: ["选手", "players", "list"] },
  { href: "/ladder", label: "天梯 MMR", words: ["天梯", "mmr", "ladder", "elo", "排行", "ranking"] },
  { href: "/points", label: "年度积分榜", words: ["积分", "points", "年度"] },
  { href: "/top", label: "年度 Top20", words: ["top20", "top", "年度"] },
  { href: "/hall", label: "名人堂", words: ["名人堂", "hall", "fame", "冠军", "champions"] },
  { href: "/season", label: "赛季总览", words: ["赛季", "season", "总览"] },
  { href: "/stats", label: "数据", words: ["数据", "统计", "stats", "statistics"] },
  { href: "/stats#vehicles", label: "载具统计", words: ["载具", "vehicles", "ban", "pick"] },
  { href: "/pools", label: "载具池模板", words: ["载具池", "pools", "templates"] },
];

const byScore = (a, b) => a.score - b.score;

/**
 * { players, events, pages } for `query`: up to `limit` each. Players:
 * recently seen first among equal matches; events: newest first.
 */
export function searchSite(query, { players = [], events = [] } = {}, limit = 6) {
  const q = String(query || "").trim();
  if (!q) return { players: [], events: [], pages: [] };
  const seen = (p) => (p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0);
  const playerHits = [];
  for (const p of players) {
    // A team name matches less than the player's own name.
    const team = matchScore(p.team, q);
    const score = Math.min(...[p.id, p.display_name].map((x) => matchScore(x, q)).map((s) => (s < 0 ? 9 : s)), team < 0 ? 9 : team + 2);
    if (score < 9) playerHits.push({ score, item: p });
  }
  playerHits.sort((a, b) => byScore(a, b) || seen(b.item) - seen(a.item));

  const when = (t) => String(t.played_at || t.scheduled_time || t.created_at || "");
  const eventHits = [];
  for (const t of events) {
    const score = matchScore(t.name, q);
    if (score >= 0) eventHits.push({ score, item: t });
  }
  eventHits.sort((a, b) => byScore(a, b) || when(b.item).localeCompare(when(a.item)));

  const pageHits = [];
  const fq = fold(q);
  for (const pg of PAGES) {
    const score = Math.min(...[pg.label, ...pg.words].map((w) => matchScore(w, q)).map((s) => (s < 0 ? 9 : s)));
    if (score < 9 && fq.length >= 2) pageHits.push({ score, item: pg });
  }
  pageHits.sort(byScore);

  return {
    players: playerHits.slice(0, limit).map((h) => h.item),
    events: eventHits.slice(0, limit).map((h) => h.item),
    pages: pageHits.slice(0, 3).map((h) => h.item),
  };
}

/** The results as one list for arrow keys: [{ kind, href, item }]. */
export function flatResults(res) {
  return [
    ...res.pages.map((item) => ({ kind: "page", href: item.href, item })),
    ...res.players.map((item) => ({ kind: "player", href: `/player/${encodeURIComponent(item.id)}`, item })),
    ...res.events.map((item) => ({ kind: "event", href: `/tournament/${encodeURIComponent(item.id)}`, item })),
  ];
}
