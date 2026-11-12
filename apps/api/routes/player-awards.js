// 本场看点 (lib/event-highlights.js), achievements and season recaps
// (lib/player-awards.js), the season's Top 20 (lib/season-top.js) and the
// season at a glance (lib/season-summary.js).

import { LadderRepo } from '../repositories/ladder-repo.js';
import { PlayerRepo } from '../repositories/player-repo.js';
import { cached } from '../lib/ladder-cache.js';
import { eventPlacements } from '../lib/placements.js';
import { buildHighlights } from '../lib/event-highlights.js';
import { buildAchievements, buildSeasonRecap, seasonPointsRanking } from '../lib/player-awards.js';
import { changeProblem, normalizeRanking, publicView, TOP_SIZE } from '../lib/season-top.js';
import { normalizeSeason } from '../lib/points.js';
import { requireAdmin, isAdminRequest } from '../lib/admin.js';
import { currentSeason, seasonBoards } from './points.js';
import { noticeText } from '../lib/bot-notices.js';
import { buildSeasonSummary, seasonList } from '../lib/season-summary.js';
import { buildHeadToHead } from '../lib/head-to-head.js';

const EVENT_COLUMNS = 'id, name, status, format, playoff_format, swiss_rounds, swiss_group_size, advance_per_group, source_title, tier, event_kind, vehicle_pool, game_mode, points_season, scheduled_time, played_at, created_at';

const groupBy = (rows, key) => {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r[key])) map.set(r[key], []);
    map.get(r[key]).push(r);
  }
  return map;
};

/**
 * The data achievements, recaps and the Top 20 read, cached like the
 * ladder: { context(), seasonRanking(season) }.
 */
export function awardsData(db) {
  const ladderRepo = LadderRepo(db);
  const playerRepo = PlayerRepo(db);
  // Everything achievements and recaps need, once per cache lifetime.
  const context = () => cached(db, 'awards-context', async () => {
    const [tournaments, regs, matches, banpick, players, ratings] = await Promise.all([
      db.query(`SELECT ${EVENT_COLUMNS} FROM axsuck.tournaments WHERE status = 'completed'`).then((r) => r.rows),
      db.query('SELECT tournament_id, player_id, seed, swiss_group FROM axsuck.tournament_players').then((r) => r.rows),
      db.query("SELECT * FROM axsuck.matches WHERE status IN ('completed', 'walkover')").then((r) => r.rows),
      db.query('SELECT id, tournament_id, player1_id, player2_id, banpick FROM axsuck.matches WHERE banpick IS NOT NULL').then((r) => r.rows),
      playerRepo.list(),
      ladderRepo.getRatings({ includeInactive: true }),
    ]);
    const registrations = new Map([...groupBy(regs, 'tournament_id')].map(([k, rows]) => [k, rows.map((r) => ({ id: r.player_id, seed: r.seed, swiss_group: r.swiss_group }))]));
    const matchesBy = groupBy(matches, 'tournament_id');
    const places = new Map(tournaments.map((t) => [t.id, eventPlacements(t, matchesBy.get(t.id) || [], registrations.get(t.id) || [])]));
    return {
      tournaments,
      registrations,
      matches: matchesBy,
      places,
      history: ratings.history,
      banpick,
      names: new Map(players.map((p) => [p.id, { name: p.display_name || p.id, flag: p.flag || '' }])),
    };
  });

  const seasonRanking = (season) => cached(db, JSON.stringify(['season-ranking', season]), async () => seasonPointsRanking(await seasonBoards(db, season)));

  return { context, seasonRanking };
}

/** One line about a player's season, for the Top 20's QQ notice. */
export function topDescriber(db) {
  const data = awardsData(db);
  return async (season, id) => {
    const ranking = await data.seasonRanking(season);
    const mine = ranking.find((r) => r.id === id);
    const r = buildSeasonRecap(id, season, await data.context(), mine ? { total: mine.total, rank: mine.rank } : null);
    return { name: r.player.name, line: noticeText.topStats(r) };
  };
}

export default async function playerAwardsRoutes(fastify) {
  const db = fastify.db;
  const ladderRepo = LadderRepo(db);
  const { context, seasonRanking } = awardsData(db);

  async function seasonOf(raw) {
    return normalizeSeason(raw) || (await currentSeason(db));
  }

  // 本场看点 of a finished event: ratings in the event's own division.
  fastify.get('/tournaments/:id/highlights', async (req) => {
    const id = String(req.params.id);
    return cached(db, JSON.stringify(['highlights', id]), async () => {
      const t = (await db.query(`SELECT ${EVENT_COLUMNS} FROM axsuck.tournaments WHERE id = $1`, [id])).rows[0];
      if (!t) throw fastify.httpErrors.notFound('Tournament not found');
      if (t.status !== 'completed') return { upset: null, upsets: 0, closest: null, darkHorse: null };
      const [matches, regs, ratings] = await Promise.all([
        db.query("SELECT * FROM axsuck.matches WHERE tournament_id = $1 AND status IN ('completed', 'walkover')", [id]).then((r) => r.rows),
        db.query('SELECT player_id, seed, swiss_group FROM axsuck.tournament_players WHERE tournament_id = $1', [id]).then((r) => r.rows),
        ladderRepo.getRatings({ includeInactive: true, mode: t.game_mode || '', pool: t.vehicle_pool || '' }),
      ]);
      const players = regs.map((r) => ({ id: r.player_id, seed: r.seed, swiss_group: r.swiss_group }));
      return buildHighlights({
        matches,
        history: ratings.history.filter((h) => h.tournament_id === id),
        places: eventPlacements(t, matches, players),
        seeds: new Map(regs.map((r) => [r.player_id, r.seed])),
      });
    });
  });

  fastify.get('/players/:id/achievements', async (req) => buildAchievements(String(req.params.id), await context()));

  fastify.get('/players/:id/season-recap', async (req) => {
    const season = await seasonOf(req.query?.season);
    const id = String(req.params.id);
    const ranking = await seasonRanking(season);
    const mine = ranking.find((r) => r.id === id);
    return buildSeasonRecap(id, season, await context(), mine ? { total: mine.total, rank: mine.rank, of: ranking.length } : null);
  });

  // The Top 20: visitors see the revealed places; admins also get the full
  // ranking and the points ranking to pick from.
  fastify.get('/seasons/:season/top', async (req, reply) => {
    const season = await seasonOf(req.params.season);
    reply.header('Cache-Control', 'no-store');
    const row = (await db.query('SELECT * FROM axsuck.season_top WHERE season = $1', [season])).rows[0] || null;
    const ctx = await context();
    const ranking = await seasonRanking(season);
    const pointsOf = (id) => {
      const r = ranking.find((x) => x.id === id);
      return r ? { total: r.total, rank: r.rank, of: ranking.length } : null;
    };
    const view = publicView(row);
    const out = {
      season,
      ...view,
      revealed: view.revealed.map((r) => ({ ...r, recap: buildSeasonRecap(r.id, season, ctx, pointsOf(r.id)) })),
    };
    if (isAdminRequest(req)) {
      const name = (id) => ({ id, name: ctx.names.get(id)?.name || id, flag: ctx.names.get(id)?.flag || '', points: pointsOf(id) });
      out.admin = {
        ranking: normalizeRanking(row?.ranking).map(name),
        suggested: ranking.slice(0, TOP_SIZE).map((r) => name(r.id)),
        candidates: ranking.slice(0, 40).map((r) => name(r.id)),
        announced: row?.announced || 0,
      };
    }
    return out;
  });

  fastify.put('/seasons/:season/top', async (req) => {
    requireAdmin(fastify, req);
    const season = normalizeSeason(req.params.season);
    if (!season) throw fastify.httpErrors.badRequest('赛季必须是年份，如 2026');
    const ranking = normalizeRanking(req.body?.ranking);
    const startAt = req.body?.start_at ? new Date(req.body.start_at) : null;
    if (startAt && Number.isNaN(startAt.getTime())) throw fastify.httpErrors.badRequest('开始时间无效');
    const known = new Set((await db.query('SELECT id FROM axsuck.players WHERE id = ANY($1::text[])', [ranking])).rows.map((r) => r.id));
    const missing = ranking.filter((id) => !known.has(id));
    if (missing.length) throw fastify.httpErrors.badRequest(`没有这个选手：${missing.join('、')}`);
    const before = (await db.query('SELECT * FROM axsuck.season_top WHERE season = $1', [season])).rows[0] || null;
    const problem = changeProblem(before, { ranking, start_at: startAt }, Date.now());
    if (problem) throw fastify.httpErrors.badRequest(problem);
    await db.query(`
      INSERT INTO axsuck.season_top (season, ranking, start_at, updated_at) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (season) DO UPDATE SET ranking = EXCLUDED.ranking, start_at = EXCLUDED.start_at, updated_at = NOW()
    `, [season, JSON.stringify(ranking), startAt]);
    return { season, ranking, start_at: startAt ? startAt.toISOString() : null };
  });

  // A season at a glance (the /season page): numbers, champions, leaders,
  // each points board's top 3 and how far the Top 20 is. No season: the
  // current one.
  fastify.get('/season-summary', async (req) => {
    const season = await seasonOf(req.query?.season);
    const ctx = await context();
    const [boards, pointsSeasons, topRow] = await Promise.all([
      seasonBoards(db, season).catch(() => []),
      db.query('SELECT DISTINCT points_season AS season FROM axsuck.tournaments WHERE points_season IS NOT NULL').then((r) => r.rows.map((x) => x.season)),
      db.query('SELECT season, ranking, start_at, announced FROM axsuck.season_top WHERE season = $1', [season]).then((r) => r.rows[0] || null),
    ]);
    const top = topRow ? publicView(topRow, Date.now()) : null;
    const name = (id) => ctx.names.get(id) || { name: id, flag: '' };
    const first = top?.revealed?.find((r) => r.rank === 1);
    return {
      ...buildSeasonSummary(season, ctx),
      seasons: seasonList(pointsSeasons, ctx.tournaments),
      boards: (boards || []).map((b) => ({
        pool: b.pool,
        events: b.events?.length || 0,
        top: (b.players || []).slice(0, 3).map((p) => ({ id: p.id || p.player_id, name: p.display_name || name(p.id || p.player_id).name, flag: p.flag || '', total: p.total, rank: p.rank })),
      })),
      top: top && top.size
        ? { size: top.size, revealed: top.revealed.length, started: top.started, done: top.done, next: top.next, first: first ? { id: first.id, ...name(first.id) } : null }
        : null,
    };
  });

  // Two players against each other (finished events): the QQ bot's 交手.
  fastify.get('/players/:id/vs/:other', async (req) => {
    const a = String(req.params.id);
    const b = String(req.params.other);
    if (a === b) throw fastify.httpErrors.badRequest('请填两位不同的选手');
    const ctx = await context();
    for (const id of [a, b]) if (!ctx.names.has(id)) throw fastify.httpErrors.notFound(`没有找到选手「${id}」`);
    return buildHeadToHead(a, b, ctx);
  });
}
