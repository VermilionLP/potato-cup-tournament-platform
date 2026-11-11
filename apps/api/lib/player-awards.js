// A player's achievements (badges) and season recap, and the season's Top 20
// candidates. Pure: callers pass the rows (routes/player-awards.js loads
// and caches them).
//
// ctx = {
//   tournaments: finished events (id, name, tier, event_kind, vehicle_pool,
//                points_season, played_at / scheduled_time / created_at),
//   registrations: Map eventId -> [{ id, seed, swiss_group }],
//   matches:       Map eventId -> decided matches,
//   places:        Map eventId -> Map playerId -> { from, to },
//   history:       the ladder history (chronological, two rows per game),
//   banpick:       [{ tournament_id, player1_id, player2_id, banpick }],
//   names:         Map playerId -> { name, flag },
// }

import { isQualifierEvent } from './champions.js';
import { dateOf } from './hall-of-fame.js';
import { normalizeKind } from './event-tier.js';

/** The badges, in display order: id, title, how to earn it, the target. */
export const ACHIEVEMENTS = [
  { id: 'first-title', title: '首冠', desc: '赢得第一个冠军', target: 1, stat: 'titles' },
  { id: 'three-titles', title: '三冠王', desc: '累计 3 个冠军', target: 3, stat: 'titles' },
  { id: 'major-title', title: '大赛冠军', desc: '赢得一场大型赛事的冠军', target: 1, stat: 'majorTitles' },
  { id: 'perfect-run', title: '零封夺冠', desc: '一局不丢拿下冠军', target: 1, stat: 'perfectRuns' },
  { id: 'podiums', title: '领奖台常客', desc: '5 次进入前三', target: 5, stat: 'podiums' },
  { id: 'events-10', title: '老兵', desc: '参加 10 场赛事', target: 10, stat: 'events' },
  { id: 'events-30', title: '元老', desc: '参加 30 场赛事', target: 30, stat: 'events' },
  { id: 'matches-50', title: '身经百战', desc: '打满 50 场比赛', target: 50, stat: 'matches' },
  { id: 'streak-5', title: '五连胜', desc: '连续赢下 5 场比赛', target: 5, stat: 'bestStreak' },
  { id: 'streak-10', title: '十连胜', desc: '连续赢下 10 场比赛', target: 10, stat: 'bestStreak' },
  { id: 'giant-killer', title: '以下克上', desc: '赢下天梯分比你高 300 以上的对手', target: 1, stat: 'giantKills' },
  { id: 'iron', title: '全勤', desc: '参加 10 场赛事且从未弃权', target: 10, stat: 'ironEvents' },
];

export const GIANT_GAP = 300;

const loserOf = (m) => (m.winner_id === m.player1_id ? m.player2_id : m.player1_id);
const inMatch = (m, id) => m.player1_id === id || m.player2_id === id;

/** A player's numbers over the given events and ladder history rows. */
function playerNumbers(id, ctx, events, history) {
  const n = { titles: 0, majorTitles: 0, perfectRuns: 0, podiums: 0, events: 0, matches: 0, wins: 0, losses: 0, walkoverLosses: 0, bestStreak: 0, giantKills: 0, ironEvents: 0 };
  n.titleEvents = [];
  n.best = null; // { place, to, event }
  for (const t of events) {
    const reg = ctx.registrations.get(t.id) || [];
    if (!reg.some((r) => r.id === id)) continue;
    n.events += 1;
    const ms = (ctx.matches.get(t.id) || []).filter((m) => inMatch(m, id));
    let lostMap = false;
    let walkedOver = false;
    for (const m of ms) {
      if (m.status === 'walkover') {
        if (m.winner_id && m.winner_id !== id) walkedOver = true;
        continue;
      }
      if (!m.winner_id) continue;
      n.matches += 1;
      if (m.winner_id === id) n.wins += 1;
      else n.losses += 1;
      const against = m.player1_id === id ? Number(m.score2) || 0 : Number(m.score1) || 0;
      if (against > 0) lostMap = true;
    }
    if (walkedOver) n.walkoverLosses += 1;
    else n.ironEvents += 1;
    const place = ctx.places.get(t.id)?.get(id);
    if (place && !isQualifierEvent(t)) {
      if (!n.best || place.from < n.best.place) n.best = { place: place.from, to: place.to, event: { id: t.id, name: t.name } };
      if (place.from <= 3) n.podiums += 1;
      if (place.from === 1) {
        n.titles += 1;
        n.titleEvents.push({ id: t.id, name: t.name });
        if (normalizeKind(t.event_kind) === 'major') n.majorTitles += 1;
        if (!lostMap && ms.length) n.perfectRuns += 1;
      }
    }
  }
  // An event with a walkover loss breaks the attendance run for good.
  if (n.walkoverLosses) n.ironEvents = 0;

  let run = 0;
  for (const h of history) {
    if (h.player_id !== id) continue;
    if (h.won) {
      run += 1;
      n.bestStreak = Math.max(n.bestStreak, run);
      if (h.opponent_rating_before - h.rating_before >= GIANT_GAP) n.giantKills += 1;
    } else run = 0;
  }
  return n;
}

/** Every badge with earned / progress for one player. */
export function buildAchievements(id, ctx) {
  const n = playerNumbers(id, ctx, ctx.tournaments, ctx.history);
  const list = ACHIEVEMENTS.map((a) => {
    const value = n[a.stat] || 0;
    return { id: a.id, title: a.title, desc: a.desc, target: a.target, value: Math.min(value, a.target), earned: value >= a.target };
  });
  return { earned: list.filter((a) => a.earned).length, total: list.length, achievements: list };
}

/** Events of a points season: those counted in it, else those played that year. */
export function seasonEvents(tournaments, season) {
  const s = String(season);
  return tournaments.filter((t) => (t.points_season ? String(t.points_season) === s : String(dateOf(t) || '').startsWith(s)));
}

/**
 * One player's season in numbers, for the recap image and the Top 20
 * cards. `points`: { total, rank } across the season's boards (or null).
 */
export function buildSeasonRecap(id, season, ctx, points = null) {
  const events = seasonEvents(ctx.tournaments, season);
  const ids = new Set(events.map((t) => t.id));
  const history = ctx.history.filter((h) => ids.has(h.tournament_id));
  const n = playerNumbers(id, ctx, events, history);

  let peak = null;
  const opponents = new Map();
  for (const h of history) {
    if (h.player_id !== id) continue;
    const after = Math.round(h.rating_after);
    if (peak == null || after > peak) peak = after;
    const o = opponents.get(h.opponent_id) || { id: h.opponent_id, played: 0, won: 0 };
    o.played += 1;
    if (h.won) o.won += 1;
    opponents.set(h.opponent_id, o);
  }
  const rival = [...opponents.values()].sort((a, b) => b.played - a.played || a.id.localeCompare(b.id))[0] || null;

  const vehicles = new Map();
  for (const r of ctx.banpick) {
    if (!ids.has(r.tournament_id) || !inMatch(r, id)) continue;
    const state = r.banpick?.state;
    if (state?.phase !== 'done') continue;
    const name = state.vehicle || state.group;
    if (name) vehicles.set(name, (vehicles.get(name) || 0) + 1);
  }
  const vehicle = [...vehicles.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
  const name = ctx.names.get(id) || {};
  return {
    season: String(season),
    player: { id, name: name.name || id, flag: name.flag || '' },
    events: n.events,
    matches: n.matches,
    wins: n.wins,
    losses: n.losses,
    win_rate: n.matches ? n.wins / n.matches : null,
    titles: n.titles,
    title_events: n.titleEvents,
    podiums: n.podiums,
    best: n.best,
    best_streak: n.bestStreak,
    peak_mmr: peak,
    rival: rival ? { ...rival, name: ctx.names.get(rival.id)?.name || rival.id, flag: ctx.names.get(rival.id)?.flag || '' } : null,
    vehicle: vehicle ? { name: vehicle[0], times: vehicle[1] } : null,
    points,
  };
}

/**
 * The season's players ranked by points summed over every board (event
 * type): [{ id, total, rank }]; ties share a rank.
 */
export function seasonPointsRanking(boards = []) {
  const totals = new Map();
  for (const b of boards) {
    for (const p of b.players || []) {
      const id = p.id || p.player_id;
      totals.set(id, (totals.get(id) || 0) + (Number(p.total) || 0));
    }
  }
  const rows = [...totals.entries()]
    .map(([id, total]) => ({ id, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  let rank = 0;
  rows.forEach((r, i) => {
    if (i === 0 || r.total !== rows[i - 1].total) rank = i + 1;
    r.rank = rank;
  });
  return rows;
}
