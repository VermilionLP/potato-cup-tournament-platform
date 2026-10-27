import { PlayerRepo, mergePlayerInto } from '../repositories/player-repo.js';
import { TournamentRepo } from '../repositories/tournament-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { GAME_MODES, VEHICLE_POOLS } from '../lib/tournament-config.js';
import { isQualifierEvent, tournamentChampion } from '../lib/champions.js';
import { betterPlace, eventPlacements } from '../lib/placements.js';
import { ACTIVE_DAYS } from '../lib/ladder.js';
import { getRequesterId, requireAdmin, requireSelfOrAdmin } from '../lib/admin.js';
import { hashPlayerKey, newPlayerKey, playerKeyMatches, requestPlayerKey, storedKeyHash } from '../lib/player-key.js';

export default async function playersRoutes(fastify) {
  const repo = PlayerRepo(fastify.db);
  const tourneyRepo = TournamentRepo(fastify.db);
  const ladderRepo = LadderRepo(fastify.db);

  // Play-time statistics used to be derived from parsed replay start times.
  // Replay support has been removed, so the endpoint reports an empty dataset
  // while keeping its response shape for the statistics page.
  fastify.get('/stats/play-times', async () => ({
    total_games: 0,
    total_nights: 0,
    weekdays: [0, 0, 0, 0, 0, 0, 0],
    night_hours: {},
    top_slots: []
  }));

  fastify.get('/players/statistics', async () => {
    const players = await repo.list();
    const registrations = (await fastify.db.query('SELECT * FROM axsuck.tournament_players')).rows;
    const matches = (await fastify.db.query("SELECT * FROM axsuck.matches WHERE status IN ('completed', 'walkover')")).rows;
    const tournaments = (await fastify.db.query(
      'SELECT id, name, game_mode, vehicle_pool, status, format, playoff_format, swiss_rounds, swiss_group_size, advance_per_group, source_title FROM axsuck.tournaments'
    )).rows;
    const tournamentMap = {};
    const modeOf = {};
    const poolOf = {};
    for (const t of tournaments) {
      tournamentMap[t.id] = t.name;
      modeOf[t.id] = GAME_MODES.includes(t.game_mode) ? t.game_mode : 'rb';
      poolOf[t.id] = VEHICLE_POOLS.includes(t.vehicle_pool) ? t.vehicle_pool : null;
    }
    const emptyRecords = (keys) => Object.fromEntries(keys.map((m) => [m, {
      tournaments: 0, matches_won: 0, matches_lost: 0, maps_won: 0, maps_lost: 0,
    }]));
    const emptyModes = () => emptyRecords(GAME_MODES);

    const stats = {};
    for (const p of players) {
      stats[p.id] = {
        id: p.id,
        display_name: p.display_name,
        team: p.team || '',
        flag: p.flag || 'cn',
        tournaments_played: 0,
        matches_played: 0,
        matches_won: 0,
        matches_lost: 0,
        walkover_wins: 0,
        walkover_losses: 0,
        maps_played: 0,
        maps_won: 0,
        maps_lost: 0,
        modes: emptyModes(),
        pools: emptyRecords(VEHICLE_POOLS),
        championships: 0,
        opponents: {},
        tournament_ids: []
      };
    }

    for (const reg of registrations) {
      if (stats[reg.player_id]) {
        stats[reg.player_id].tournaments_played++;
        const mode = modeOf[reg.tournament_id];
        if (mode) stats[reg.player_id].modes[mode].tournaments++;
        const pool = poolOf[reg.tournament_id];
        if (pool) stats[reg.player_id].pools[pool].tournaments++;
        if (!stats[reg.player_id].tournament_ids.includes(reg.tournament_id)) {
          stats[reg.player_id].tournament_ids.push(reg.tournament_id);
        }
      }
    }

    for (const m of matches) {
      const p1 = m.player1_id;
      const p2 = m.player2_id;
      const w = m.winner_id;
      if (!p1 || !p2) continue;

      if (m.status === 'walkover') {
        if (w === p1) {
          if (stats[p1]) stats[p1].walkover_wins++;
          if (stats[p2]) stats[p2].walkover_losses++;
        } else if (w === p2) {
          if (stats[p2]) stats[p2].walkover_wins++;
          if (stats[p1]) stats[p1].walkover_losses++;
        }
      } else {
        const p1Won = m.score1 > m.score2;
        const s1 = m.score1;
        const s2 = m.score2;
        const totalMaps = s1 + s2;
        const mode = modeOf[m.tournament_id] || 'rb';
        const pool = poolOf[m.tournament_id];
        for (const [id, won, mine, theirs] of [[p1, p1Won, s1, s2], [p2, !p1Won, s2, s1]]) {
          const recs = [stats[id]?.modes[mode], pool ? stats[id]?.pools[pool] : null];
          for (const rec of recs) {
            if (!rec) continue;
            if (won) rec.matches_won++;
            else rec.matches_lost++;
            rec.maps_won += mine;
            rec.maps_lost += theirs;
          }
        }

        if (stats[p1]) {
          stats[p1].matches_played++;
          if (p1Won) stats[p1].matches_won++;
          else stats[p1].matches_lost++;

          stats[p1].maps_played += totalMaps;
          stats[p1].maps_won += s1;
          stats[p1].maps_lost += s2;

          if (stats[p2]) {
            if (!stats[p1].opponents[p2]) {
              stats[p1].opponents[p2] = { won_matches: 0, lost_matches: 0, won_maps: 0, lost_maps: 0 };
            }
            if (p1Won) stats[p1].opponents[p2].won_matches++;
            else stats[p1].opponents[p2].lost_matches++;

            stats[p1].opponents[p2].won_maps += s1;
            stats[p1].opponents[p2].lost_maps += s2;
          }
        }

        if (stats[p2]) {
          stats[p2].matches_played++;
          if (!p1Won) stats[p2].matches_won++;
          else stats[p2].matches_lost++;

          stats[p2].maps_played += totalMaps;
          stats[p2].maps_won += s2;
          stats[p2].maps_lost += s1;

          if (stats[p1]) {
            if (!stats[p2].opponents[p1]) {
              stats[p2].opponents[p1] = { won_matches: 0, lost_matches: 0, won_maps: 0, lost_maps: 0 };
            }
            if (!p1Won) stats[p2].opponents[p1].won_matches++;
            else stats[p2].opponents[p1].lost_matches++;

            stats[p2].opponents[p1].won_maps += s2;
            stats[p2].opponents[p1].lost_maps += s1;
          }
        }
      }
    }

    // Titles: the champion of every finished event (qualifiers excluded).
    const matchesByEvent = new Map();
    for (const m of matches) {
      if (!matchesByEvent.has(m.tournament_id)) matchesByEvent.set(m.tournament_id, []);
      matchesByEvent.get(m.tournament_id).push(m);
    }
    const playersByEvent = new Map();
    for (const reg of registrations) {
      if (!playersByEvent.has(reg.tournament_id)) playersByEvent.set(reg.tournament_id, []);
      playersByEvent.get(reg.tournament_id).push({ id: reg.player_id, seed: reg.seed, swiss_group: reg.swiss_group });
    }
    // Placings of every finished event; the best one (qualifiers excluded)
    // stands in for titles on the overview.
    const placeOf = new Map(); // `${tournament}|${player}` -> { from, to }
    const bestPlace = {};
    for (const t of tournaments) {
      if (t.status !== 'completed') continue;
      const evMatches = matchesByEvent.get(t.id) || [];
      const evPlayers = playersByEvent.get(t.id) || [];
      const qualifier = isQualifierEvent(t);
      if (!qualifier) {
        const champion = tournamentChampion(t, evMatches, evPlayers);
        if (champion && stats[champion]) stats[champion].championships += 1;
      }
      for (const [playerId, place] of eventPlacements(t, evMatches, evPlayers)) {
        placeOf.set(`${t.id}|${playerId}`, place);
        if (!qualifier) bestPlace[playerId] = betterPlace(bestPlace[playerId], place);
      }
    }
    const qualifierIds = new Set(tournaments.filter(isQualifierEvent).map((t) => t.id));

    // Activity and rating, as on the ladder: last rated game and whether the
    // player has any rated game at all.
    const ladder = await ladderRepo.getRatings({ includeInactive: true });
    const activeSince = Date.now() - ACTIVE_DAYS * 86400000;

    const playerStats = Object.values(stats).map(s => {
      let nemesis = null;
      let maxLostMatches = 0;
      let favorite = null;
      let maxWonMatches = 0;

      for (const [oppId, rec] of Object.entries(s.opponents)) {
        if (rec.lost_matches > maxLostMatches) {
          maxLostMatches = rec.lost_matches;
          nemesis = oppId;
        }
        if (rec.won_matches > maxWonMatches) {
          maxWonMatches = rec.won_matches;
          favorite = oppId;
        }
      }

      const nemesisDisp = nemesis && stats[nemesis] ? stats[nemesis].display_name : nemesis;
      const favoriteDisp = favorite && stats[favorite] ? stats[favorite].display_name : favorite;

      // Favourite mode: most matches played, then most events entered;
      // '' when the player has neither.
      let mainMode = '';
      let best = 0;
      for (const mode of GAME_MODES) {
        const r = s.modes[mode];
        const score = (r.matches_won + r.matches_lost) * 1000 + r.tournaments;
        if (score > best) {
          best = score;
          mainMode = mode;
        }
      }

      return {
        id: s.id,
        display_name: s.display_name,
        team: s.team,
        flag: s.flag,
        main_mode: mainMode,
        tournaments_played: s.tournaments_played,
        matches_played: s.matches_played,
        matches_won: s.matches_won,
        matches_lost: s.matches_lost,
        match_win_rate: s.matches_played > 0 ? (s.matches_won / s.matches_played) : 0,
        walkover_wins: s.walkover_wins,
        walkover_losses: s.walkover_losses,
        maps_played: s.maps_played,
        maps_won: s.maps_won,
        maps_lost: s.maps_lost,
        map_win_rate: s.maps_played > 0 ? (s.maps_won / s.maps_played) : 0,
        modes: s.modes,
        pools: s.pools,
        championships: s.championships,
        nemesis: nemesis ? { id: nemesis, display_name: nemesisDisp, count: maxLostMatches } : null,
        favorite: favorite ? { id: favorite, display_name: favoriteDisp, count: maxWonMatches } : null,
        best_place: bestPlace[s.id] || null,
        // Sort key for the titles column: titles first, then the best placing.
        honor_score: s.championships > 0
          ? 100000 + s.championships
          : bestPlace[s.id] ? 1000 - Math.min(999, bestPlace[s.id].from) : 0,
        last_game_at: ladder.byId.get(s.id)?.last_game_at ?? null,
        rated: (ladder.byId.get(s.id)?.games ?? 0) > 0,
        active: (() => {
          const at = ladder.byId.get(s.id)?.last_game_at;
          return at != null && new Date(at).getTime() >= activeSince;
        })(),
        tournaments: s.tournament_ids.map(tid => ({
          id: tid,
          name: tournamentMap[tid] || tid,
          place: placeOf.get(`${tid}|${s.id}`) || null,
          qualifier: qualifierIds.has(tid),
        }))
      };
    });

    const totalTournaments = (await fastify.db.query('SELECT COUNT(*)::int as count FROM axsuck.tournaments')).rows[0]?.count || 0;
    const totalMatches = (await fastify.db.query("SELECT COUNT(*)::int as count FROM axsuck.matches WHERE status != 'pending'")).rows[0]?.count || 0;
    const eligibleForRate = playerStats.filter(p => p.matches_played >= 5);

    return {
      players: playerStats,
      global: {
        total_players: players.length,
        total_tournaments: totalTournaments,
        total_matches: totalMatches
      },
      rankings: {
        by_championships: [...playerStats]
          .filter(p => p.championships > 0)
          .sort((a, b) => b.championships - a.championships || b.match_win_rate - a.match_win_rate)
          .slice(0, 5),
        by_win_rate: [...eligibleForRate]
          .sort((a, b) => b.match_win_rate - a.match_win_rate)
          .slice(0, 5),
        by_played: [...playerStats]
          .sort((a, b) => b.matches_played - a.matches_played)
          .slice(0, 5),
        by_walkover: [...playerStats]
          .filter(p => p.walkover_losses > 0)
          .sort((a, b) => b.walkover_losses - a.walkover_losses)
          .slice(0, 5)
      }
    };
  });

  fastify.get('/players', async () => {
    return await repo.list();
  });

  fastify.get('/players/:id', async (req) => {
    const p = await repo.getById(req.params.id);
    if (!p) throw fastify.httpErrors.notFound('Player not found');
    return {
      ...p,
      tournaments: await repo.getTournaments(req.params.id)
    };
  });

  fastify.post('/players/:id/touch', async (req) => {
    const id = String(req.params.id || '').trim();
    if (!id) throw fastify.httpErrors.badRequest('id is required');
    await requireSelfOrAdmin(fastify, req, id);
    return await repo.touch(id);
  });

  // ---- Device keys (lib/player-key.js) ----
  // Binds a key to the caller's own ID the first time; afterwards confirms
  // whether the key the caller sent is the bound one. 409 when the ID is
  // bound to another device.
  fastify.post('/players/:id/key', async (req) => {
    const id = String(req.params.id || '').trim();
    if (!id || getRequesterId(req) !== id) {
      throw fastify.httpErrors.forbidden('You may only bind a key to your own player ID.');
    }
    if (!(await repo.getById(id))) throw fastify.httpErrors.notFound('Player not found');
    const hash = await storedKeyHash(fastify.db, id);
    if (hash) {
      if (playerKeyMatches(requestPlayerKey(req), hash)) return { bound: true };
      throw fastify.httpErrors.conflict('该选手 ID 已绑定其他设备');
    }
    const key = newPlayerKey();
    const inserted = await fastify.db.query(
      `INSERT INTO axsuck.player_keys (player_id, key_hash) VALUES ($1, $2)
       ON CONFLICT (player_id) DO NOTHING RETURNING player_id`,
      [id, hashPlayerKey(key)]
    );
    if (!inserted.rows.length) throw fastify.httpErrors.conflict('该选手 ID 已绑定其他设备');
    fastify.esLogger?.audit?.({ level: 'info', action: 'player_key.bound', playerId: id, ip: req.ip });
    return { bound: true, key };
  });

  // Whether an ID is bound (admins see it on the player editor).
  fastify.get('/players/:id/key', async (req) => {
    requireAdmin(fastify, req);
    return { bound: Boolean(await storedKeyHash(fastify.db, req.params.id)) };
  });

  // Admin: unbind, so the player can bind a new device.
  fastify.delete('/players/:id/key', async (req) => {
    requireAdmin(fastify, req);
    await fastify.db.query('DELETE FROM axsuck.player_keys WHERE player_id = $1', [req.params.id]);
    return { bound: false };
  });

  fastify.post('/players/:id/change-id', async (req) => {
    requireAdmin(fastify, req);
    const { id: oldId } = req.params;
    const { newId } = req.body;
    if (!newId) throw fastify.httpErrors.badRequest('newId is required');

    const existing = await repo.getById(newId);
    if (existing) throw fastify.httpErrors.conflict('New Player ID already exists');

    const oldPlayer = await repo.getById(oldId);
    if (!oldPlayer) throw fastify.httpErrors.notFound('Old player not found');

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      // A rename is a merge into a fresh record: everything (registrations,
      // matches, votes, device key, profile) moves over and the old
      // id is kept as an alias for the Liquipedia import.
      await client.query('INSERT INTO axsuck.players (id, flag) VALUES ($1, $2)', [newId, '']);
      await mergePlayerInto(client, oldId, newId);
      await client.query('UPDATE axsuck.players SET last_ip = $2 WHERE id = $1', [newId, oldPlayer.last_ip || null]);

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Trigger global update to all active tournaments
    const activeTournaments = (await fastify.db.query("SELECT id FROM axsuck.tournaments WHERE status != 'completed'")).rows;
    activeTournaments.forEach(t => {
      fastify.tournamentEvents.emit(`update:${t.id}`, { type: 'player_id_changed', oldId, newId });
    });

    return { success: true, oldId, newId };
  });

  fastify.delete('/players/:id', async (req) => {
    requireAdmin(fastify, req);
    const { id } = req.params;
    
    const p = await repo.getById(id);
    if (!p) throw fastify.httpErrors.notFound('Player not found');

    // Check if player has match appearances
    const matchCountObj = (await fastify.db.query(
      'SELECT COUNT(*)::int as count FROM axsuck.matches WHERE player1_id = $1 OR player2_id = $2 OR winner_id = $3',
      [id, id, id]
    )).rows[0];

    if (matchCountObj && matchCountObj.count > 0) {
      throw fastify.httpErrors.badRequest('该选手已经在对阵比赛中出场，无法直接删除。请使用“合并选手”功能将此选手合并到正确的选手中。');
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM axsuck.tournament_players WHERE player_id = $1', [id]);
      await client.query('DELETE FROM axsuck.time_votes WHERE player_id = $1', [id]);
      await client.query('DELETE FROM axsuck.custom_votes WHERE player_id = $1', [id]);
      await client.query('DELETE FROM axsuck.players WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const activeTournaments = (await fastify.db.query("SELECT id FROM axsuck.tournaments WHERE status != 'completed'")).rows;
    activeTournaments.forEach(t => {
      fastify.tournamentEvents.emit(`update:${t.id}`, { type: 'player_deleted', id });
    });

    return { success: true };
  });

  fastify.post('/players/:id/merge', async (req) => {
    requireAdmin(fastify, req);
    const { id: oldId } = req.params;
    const { targetId } = req.body;
    if (!targetId) throw fastify.httpErrors.badRequest('targetId is required');
    
    const oldPlayer = await repo.getById(oldId);
    const targetPlayer = await repo.getById(targetId);
    if (!oldPlayer) throw fastify.httpErrors.notFound('Source player not found');
    if (!targetPlayer) throw fastify.httpErrors.notFound('Target player not found');
    if (oldId === targetId) throw fastify.httpErrors.badRequest('Cannot merge a player into themselves');

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      await mergePlayerInto(client, oldId, targetId);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const activeTournaments = (await fastify.db.query("SELECT id FROM axsuck.tournaments WHERE status != 'completed'")).rows;
    activeTournaments.forEach(t => {
      fastify.tournamentEvents.emit(`update:${t.id}`, { type: 'player_merged', oldId, targetId });
    });

    return { success: true };
  });

  fastify.post('/players', async (req) => {
    const { id, flag, team, link, battle_tags, tournament_id } = req.body;
    if (!id) throw fastify.httpErrors.badRequest('id is required');
    await requireSelfOrAdmin(fastify, req, id);

    let battleTagsStr = '{}';
    if (battle_tags) {
      battleTagsStr = typeof battle_tags === 'string' ? battle_tags : JSON.stringify(battle_tags);
    }

    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    const lastIp = (requesterId === id) ? req.ip : null;
    const updatedPlayer = await repo.upsert(id, flag, team, link, battleTagsStr, lastIp);

    if (tournament_id) {
      await fastify.db.query(`
        UPDATE axsuck.tournament_players 
        SET team = $1
        WHERE tournament_id = $2 AND player_id = $3
      `, [team || '', tournament_id, id]);

      // Trigger real-time broadcast
      fastify.tournamentEvents.emit(`update:${tournament_id}`, { type: 'player_updated', id });
    } else {
      // If global profile edit, broadcast to active tournaments
      const activeTournaments = (await fastify.db.query("SELECT id FROM axsuck.tournaments WHERE status != 'completed'")).rows;
      activeTournaments.forEach(t => {
        fastify.tournamentEvents.emit(`update:${t.id}`, { type: 'player_updated', id });
      });
    }

    return updatedPlayer;
  });

  fastify.post('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    await requireSelfOrAdmin(fastify, req, player_id);

    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.status !== 'registration') throw fastify.httpErrors.badRequest('Registration is closed');

    const existingPlayer = await repo.getById(player_id);
    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    const lastIp = (requesterId === player_id) ? req.ip : null;

    if (!existingPlayer) {
      await repo.upsert(player_id, 'cn', '', '', '{}', lastIp);
    } else {
      if (requesterId === player_id) {
        await fastify.db.query('UPDATE axsuck.players SET last_ip = $1, last_seen_at = NOW() WHERE id = $2', [req.ip, player_id]);
      }
    }
    const added = await tourneyRepo.addPlayer(req.params.id, player_id);
    if (!added) throw fastify.httpErrors.conflict('Already registered');

    // Registration defaults to ladder-ordered seeds; manual seed edits opt out.
    if (t.seed_mode !== 'manual') {
      await ladderRepo.autoSeeds(req.params.id);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    }

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'player_registered', player_id });

    return await tourneyRepo.getPlayers(req.params.id);
  });

  fastify.delete('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    await requireSelfOrAdmin(fastify, req, player_id);
    const t = await tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    await tourneyRepo.removePlayer(req.params.id, player_id);

    if (t.seed_mode !== 'manual') {
      await ladderRepo.autoSeeds(req.params.id);
      fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    }

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'player_unregistered', player_id });

    return { success: true };
  });
}
