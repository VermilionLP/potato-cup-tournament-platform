import { LadderRepo } from '../repositories/ladder-repo.js';
import { ACTIVE_DAYS, BASE_MMR, PROVISIONAL_GAMES } from '../lib/ladder.js';

function parseActiveDays(raw) {
  if (raw == null || raw === '') return ACTIVE_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return ACTIVE_DAYS;
  return Math.max(1, Math.min(3650, Math.floor(n)));
}

// 'year' = only the games of the last 365 days; anything else = all history.
function parseWindow(raw) {
  return String(raw || '').toLowerCase() === 'year' ? 'year' : 'all';
}

function parseIncludeInactive(raw) {
  return ['1', 'true', 'yes'].includes(String(raw || '').toLowerCase());
}

export default async function ladderRoutes(fastify) {
  const repo = LadderRepo(fastify.db);

  // Cross-tournament MMR ladder. Ratings are computed from all completed matches;
  // the default view only includes players active within the last ACTIVE_DAYS.
  fastify.get('/ladder', async (req) => {
    const activeDays = parseActiveDays(req.query.days);
    const includeInactive = parseIncludeInactive(req.query.include_inactive);
    const window = parseWindow(req.query.window);
    const players = await repo.leaderboard({ activeDays, includeInactive, window });
    return {
      base_mmr: BASE_MMR,
      provisional_games: PROVISIONAL_GAMES,
      active_days: activeDays,
      include_inactive: includeInactive,
      window,
      players
    };
  });

  fastify.get('/ladder/players/:id', async (req) => {
    const activeDays = parseActiveDays(req.query.days);
    const player = await repo.playerDetail(req.params.id, { activeDays, window: parseWindow(req.query.window) });
    if (!player) throw fastify.httpErrors.notFound('Player has no ladder games');
    return player;
  });
}
