import {
  BASE_MMR,
  ACTIVE_DAYS,
  PROVISIONAL_GAMES,
  computeLadder,
  randomizeSeedOrder,
  sortForSeeds,
  assignPercentileTiers,
  UNRATED_TIER,
} from '../lib/ladder.js';
import { getPlayerDisplayName } from './player-repo.js';
import { TournamentRepo } from './tournament-repo.js';

const YEAR_MS = 365 * 86400000;

export function LadderRepo(db) {
  const tournaments = TournamentRepo(db);

  // When an event was played: the imported date, else its scheduled time
  // (stored as Beijing "YYYY-MM-DDTHH:mm"), else when it was created.
  const PLAYED_AT = `COALESCE(
    t.played_at,
    CASE WHEN t.scheduled_time ~ '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])[T ]([01]\\d|2[0-3]):[0-5]\\d'
      THEN substring(t.scheduled_time from 1 for 16)::timestamp AT TIME ZONE 'Asia/Shanghai'
    END,
    t.created_at
  )`;

  // Games in the order they were played: events by date; inside an event
  // the Swiss stage first (round 1 up), then the elimination brackets from
  // their first round (highest number) to the final (round 1), grand final last.
  async function loadGames() {
    const res = await db.query(`
      SELECT
        m.id,
        m.tournament_id,
        m.round,
        m.position,
        m.player1_id,
        m.player2_id,
        m.score1,
        m.score2,
        t.name AS tournament_name,
        ${PLAYED_AT} AS played_at
      FROM axsuck.matches m
      JOIN axsuck.tournaments t ON t.id = m.tournament_id
      WHERE m.status = 'completed'
        AND m.player1_id IS NOT NULL
        AND m.player2_id IS NOT NULL
        AND m.player1_id <> m.player2_id
        AND m.score1 <> m.score2
      ORDER BY ${PLAYED_AT} ASC,
        t.created_at ASC,
        t.id ASC,
        CASE m.bracket WHEN 'sw' THEN 0 WHEN 'gf' THEN 2 ELSE 1 END,
        CASE WHEN m.bracket = 'sw' THEN m.round ELSE -m.round END,
        m.position ASC,
        m.id ASC
    `);
    return res.rows;
  }

  async function loadPlayers() {
    const res = await db.query('SELECT id, flag, team FROM axsuck.players');
    return new Map(res.rows.map((p) => [p.id, p]));
  }

  // window 'year' rates only the games of the last 365 days, from scratch.
  async function getRatings({ activeDays = ACTIVE_DAYS, includeInactive = false, window = 'all' } = {}) {
    const [allGames, playerRows] = await Promise.all([loadGames(), loadPlayers()]);
    const since = window === 'year' ? Date.now() - YEAR_MS : null;
    const games = since == null
      ? allGames
      : allGames.filter((g) => g.played_at && new Date(g.played_at).getTime() >= since);
    const { players: allPlayers, history } = computeLadder(games);
    const byId = new Map(
      allPlayers.map((p) => {
        const meta = playerRows.get(p.id) || {};
        return [
          p.id,
          {
            ...p,
            display_name: getPlayerDisplayName(meta) || p.id,
            flag: meta.flag ?? 'cn',
            team: meta.team || '',
          },
        ];
      })
    );

    const cutoff = Date.now() - activeDays * 86400000;
    const isActive = (p) =>
      p.last_game_at != null && new Date(p.last_game_at).getTime() >= cutoff;
    const visible = [...byId.values()]
      .filter((p) => includeInactive || isActive(p))
      .map((p, index) => ({
        ...p,
        rank: index + 1,
        active: isActive(p),
      }));
    const tiered = assignPercentileTiers(visible);

    return {
      players: tiered,
      byId,
      history,
      games,
      activeDays,
      includeInactive,
      window: since == null ? 'all' : 'year',
      cutoff,
    };
  }

  async function leaderboard(options = {}) {
    const { players } = await getRatings(options);
    return players;
  }

  async function playerDetail(playerId, { activeDays = ACTIVE_DAYS, window = 'all' } = {}) {
    const { byId, history, games, cutoff } = await getRatings({ activeDays, includeInactive: true, window });
    const player = byId.get(playerId);
    if (!player) return null;

    const tournamentNames = new Map(
      games.map((g) => [g.tournament_id, g.tournament_name])
    );
    // `history` is already in Elo calculation order; reverse it for newest-first
    // instead of re-sorting by timestamps (bulk-imported matches can share dates).
    const rows = history
      .filter((h) => h.player_id === playerId)
      .reverse()
      .map((h) => ({
        ...h,
        opponent_name: byId.get(h.opponent_id)?.display_name || h.opponent_id,
        tournament_name: tournamentNames.get(h.tournament_id) || h.tournament_id,
        mmr_before: Math.round(h.rating_before),
        mmr_after: Math.round(h.rating_after),
        mmr_delta: Math.round(h.delta),
        opponent_mmr: Math.round(h.opponent_rating_before),
        opponent_mmr_after: Math.round(h.opponent_rating_after),
      }));

    return {
      ...player,
      active: player.last_game_at != null && new Date(player.last_game_at).getTime() >= cutoff,
      history: rows,
    };
  }

  function withDefaults(player) {
    return {
      id: player.id,
      display_name: player.display_name || getPlayerDisplayName(player) || player.id,
      flag: player.flag || 'cn',
      team: player.team || '',
      seed: player.seed ?? null,
      registered_at: player.registered_at || null,
      rating: player.rating ?? BASE_MMR,
      mmr: player.mmr ?? BASE_MMR,
      games: player.games ?? 0,
      wins: player.wins ?? 0,
      losses: player.losses ?? 0,
      win_rate: player.win_rate ?? 0,
      last_game_at: player.last_game_at ?? null,
      provisional: player.provisional ?? (player.games ?? 0) < PROVISIONAL_GAMES,
      tier: player.tier || { ...UNRATED_TIER },
    };
  }

  async function suggestSeeds(tournamentId) {
    const [registrations, { byId }] = await Promise.all([
      db.query(
        `
        SELECT tp.player_id AS id, tp.seed, tp.registered_at,
               p.flag, p.team
        FROM axsuck.tournament_players tp
        JOIN axsuck.players p ON p.id = tp.player_id
        WHERE tp.tournament_id = $1
      `,
        [tournamentId]
      ),
      getRatings({ includeInactive: true }),
    ]);

    const players = registrations.rows.map((row) => {
      const rating = byId.get(row.id);
      return withDefaults({
        ...row,
        display_name: rating?.display_name || getPlayerDisplayName(row) || row.id,
        ...(rating
          ? {
              rating: rating.rating,
              mmr: rating.mmr,
              games: rating.games,
              wins: rating.wins,
              losses: rating.losses,
              win_rate: rating.win_rate,
              last_game_at: rating.last_game_at,
              provisional: rating.provisional,
              tier: rating.tier,
            }
          : {}),
      });
    });

    return sortForSeeds(players).map((p, index) => ({ ...p, seed: index + 1 }));
  }

  async function setSeedMode(tournamentId, mode) {
    await db.query(
      'UPDATE axsuck.tournaments SET seed_mode = $1, updated_at = NOW() WHERE id = $2',
      [mode, tournamentId]
    );
  }

  async function applySeeds(tournamentId, ordered, mode = 'auto') {
    await tournaments.setSeeds(
      tournamentId,
      ordered.map((p) => p.id)
    );
    await setSeedMode(tournamentId, mode);
    return ordered.map((p, index) => ({ ...p, seed: index + 1 }));
  }

  async function autoSeeds(tournamentId) {
    const ordered = await suggestSeeds(tournamentId);
    return applySeeds(tournamentId, ordered, 'auto');
  }

  async function randomizeSeeds(
    tournamentId,
    { band = 80, keepTop = 2, keepBottom = 2 } = {}
  ) {
    const ordered = await suggestSeeds(tournamentId);
    const randomized = randomizeSeedOrder(ordered, { band, keepTop, keepBottom });
    return applySeeds(tournamentId, randomized, 'manual');
  }

  return {
    loadGames,
    getRatings,
    leaderboard,
    playerDetail,
    suggestSeeds,
    autoSeeds,
    randomizeSeeds,
    setSeedMode,
  };
}
