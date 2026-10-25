import { TournamentRepo } from '../repositories/tournament-repo.js';
import { MatchRepo } from '../repositories/match-repo.js';
import { TournamentAccountRepo } from '../repositories/tournament-account-repo.js';
import { LadderRepo } from '../repositories/ladder-repo.js';
import { Readable } from 'stream';
import { getPlayerInfoFromReplay, bnetEntryKey } from './replays.js';
import { buildCalendarFeed, buildTournamentIcs } from '../lib/calendar.js';

export default async function tournamentsRoutes(fastify) {
  const repo = TournamentRepo(fastify.db);
  const matches = MatchRepo(fastify.db);
  const accountRepo = TournamentAccountRepo(fastify.db);
  const ladderRepo = LadderRepo(fastify.db);

  fastify.get('/tournaments', async () => {
    return await repo.list();
  });

  fastify.get('/tournaments/:id', async (req) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    
    const players = await repo.getPlayers(req.params.id);
    const ms = await repo.getMatches(req.params.id);
    const votes = await repo.getVotes(req.params.id);
    const custom_votes = await repo.getCustomVotes(req.params.id);

    const tournamentAccounts = await accountRepo.listByTournament(req.params.id);
    const accountsByPlayer = {};
    for (const a of tournamentAccounts) {
      (accountsByPlayer[a.player_id] = accountsByPlayer[a.player_id] || []).push(a);
    }

    // Dynamically retrieve player races from uploaded replays
    const matchIds = ms.map(m => m.id);
    const replays = matchIds.length > 0
      ? (await fastify.db.query('SELECT * FROM axsuck.match_replays WHERE match_id = ANY($1::int[])', [matchIds])).rows
      : [];

    const playerRaces = {};
    for (const p of players) {
      playerRaces[p.id] = {};
    }

    for (const r of replays) {
      let parsedData;
      try {
        parsedData = typeof r.parsed_data === 'string' ? JSON.parse(r.parsed_data) : r.parsed_data;
      } catch (_) {
        continue;
      }
      for (const p of players) {
        const repInfo = getPlayerInfoFromReplay(
          p.id,
          p.display_name,
          p.battle_tags,
          p.bnet_ids,
          parsedData,
          accountsByPlayer[p.id] || []
        );
        if (repInfo && repInfo.race) {
          const raceLetter = repInfo.race[0].toUpperCase();
          if (raceLetter !== '?') {
            playerRaces[p.id][raceLetter] = (playerRaces[p.id][raceLetter] || 0) + 1;
          }
        }
      }
    }

    const playersWithRace = players.map(p => {
      const races = playerRaces[p.id] || {};
      const sorted = Object.entries(races).sort((a, b) => b[1] - a[1]);
      const detectedRace = sorted.length > 0 ? sorted[0][0] : 'U';
      return {
        ...p,
        race: detectedRace,
        tournament_accounts: accountsByPlayer[p.id] || []
      };
    });

    const ladder = await ladderRepo.getRatings();
    const playersWithLadder = playersWithRace.map(p => {
      const l = ladder.byId.get(p.id);
      return {
        ...p,
        ladder_mmr: l?.mmr ?? 3000,
        ladder_games: l?.games ?? 0,
        ladder_provisional: l ? l.provisional : true,
        ladder_active: l
          ? new Date(l.last_game_at).getTime() >= ladder.cutoff
          : null,
        ladder_tier: l?.tier ?? { key: 'unrated', group: 'unrated', name: '未定级' }
      };
    });

    return {
      ...t,
      players: playersWithLadder,
      matches: ms,
      votes,
      custom_votes,
      accounts: tournamentAccounts
    };
  });

  fastify.get('/tournaments/:id/stream', { sse: 'only' }, async (req, reply) => {
    const { id: tournamentId } = req.params;
    
    reply.headers({
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });

    const stream = new Readable({
      objectMode: true,
      read() {}
    });

    const listener = (data) => {
      stream.push({ data });
    };

    fastify.tournamentEvents.on(`update:${tournamentId}`, listener);

    req.raw.on('close', () => {
      fastify.tournamentEvents.off(`update:${tournamentId}`, listener);
      stream.push(null);
    });

    await reply.sse.send(stream);
  });

  // ---- Tournament-scoped Battle.net account links (temporary / borrowed accounts) ----
  fastify.get('/tournaments/:id/accounts', async (req) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return await accountRepo.listByTournament(req.params.id);
  });

  fastify.post('/tournaments/:id/accounts', async (req) => {
    const { id: tournamentId } = req.params;
    const { player_id, accounts } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw fastify.httpErrors.badRequest('accounts array is required');
    }
    const t = await repo.getById(tournamentId);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');

    const rows = accounts.map((a) => ({
      account_key: a.account_key || bnetEntryKey(a),
      player_id,
      account_name: a.name || a.account_name || '',
      url: a.url || '',
      toon_handle: a.toon_handle || null,
      region: a.region || null,
      subregion: a.subregion != null ? a.subregion : null
    })).filter(r => r.account_key);

    await accountRepo.upsertMany(tournamentId, rows);
    fastify.tournamentEvents.emit(`update:${tournamentId}`, { type: 'accounts_updated', player_id });
    return await accountRepo.listByTournament(tournamentId);
  });

  fastify.delete('/tournaments/:id/accounts', async (req) => {
    const { id: tournamentId } = req.params;
    const { account_key } = req.body || {};
    if (!account_key) throw fastify.httpErrors.badRequest('account_key is required');
    const removed = await accountRepo.remove(tournamentId, account_key);
    fastify.tournamentEvents.emit(`update:${tournamentId}`, { type: 'accounts_updated' });
    return { success: true, removed };
  });

  fastify.post('/tournaments', async (req) => {
    const { id, name, description, player_capacity, hold_third_place, loser_advances, scheduled_time } = req.body;
    if (!id || !name) throw fastify.httpErrors.badRequest('id and name are required');
    const existing = await repo.getById(id);
    if (existing) throw fastify.httpErrors.conflict('Tournament ID already exists');
    if (player_capacity != null && (!Number.isInteger(Number(player_capacity)) || Number(player_capacity) < 2 || Number(player_capacity) > 128)) {
      throw fastify.httpErrors.badRequest('player_capacity must be between 2 and 128');
    }
    return await repo.create({ id, name, description, player_capacity, hold_third_place, loser_advances, scheduled_time });
  });

  fastify.get('/calendar.ics', async (req, reply) => {
    const tournaments = (await fastify.db.query(`
      SELECT id, name, scheduled_time
      FROM axsuck.tournaments
      WHERE status <> 'completed' AND scheduled_time <> ''
      ORDER BY created_at ASC
    `)).rows;
    const ics = buildCalendarFeed(tournaments);
    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="suck-calendar.ics"');
    return ics;
  });

  fastify.get('/tournaments/:id/calendar.ics', async (req, reply) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const ics = buildTournamentIcs({
      id: t.id,
      name: t.name,
      scheduledTime: t.scheduled_time,
    });
    if (!ics) throw fastify.httpErrors.badRequest('Tournament has no scheduled time');
    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${t.id}.ics"`);
    return ics;
  });

  fastify.patch('/tournaments/:id', async (req) => {
    const name = String(req.body?.name || '').trim();
    if (!name) throw fastify.httpErrors.badRequest('name is required');
    const updated = await repo.rename(req.params.id, name);
    if (!updated) throw fastify.httpErrors.notFound('Tournament not found');
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'name_changed', name });
    return updated;
  });

  fastify.post('/tournaments/:id/status', async (req) => {
    const { status, scheduled_time, created_at, updated_at } = req.body;
    const valid = ['registration', 'voting', 'in_progress', 'completed'];
    if (!valid.includes(status)) throw fastify.httpErrors.badRequest('Invalid status');
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const wasVoting = t.status === 'voting';

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      if (status === 'registration' || status === 'voting') {
        await client.query('UPDATE axsuck.tournaments SET active_match_id = NULL WHERE id = $1', [req.params.id]);
        await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [req.params.id]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await repo.updateStatus(req.params.id, status, scheduled_time, created_at, updated_at);

    let autoRegistered = [];
    if (wasVoting && status === 'registration') {
      try {
        autoRegistered = await repo.autoRegisterVoters(req.params.id, scheduled_time);
        if (autoRegistered.length > 0 && t.seed_mode !== 'manual') {
          await ladderRepo.autoSeeds(req.params.id);
        }
      } catch (err) {
        fastify.log.error({ err, tournament: req.params.id }, 'auto-register voters failed');
      }
    }

    const updated = await repo.getById(req.params.id);
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'status_changed', status });
    if (autoRegistered.length > 0) {
      fastify.tournamentEvents.emit(`update:${req.params.id}`, {
        type: 'players_auto_registered',
        player_ids: autoRegistered,
      });
    }
    
    return { ...updated, auto_registered: autoRegistered };
  });

  fastify.post('/tournaments/:id/overlay-state', async (req) => {
    const { overlay_scene, overlay_round } = req.body;
    const valid = ['auto', 'intro', 'ingame', 'intermission', 'hybrid'];
    if (overlay_scene && !valid.includes(overlay_scene)) throw fastify.httpErrors.badRequest('Invalid overlay_scene');
    
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');

    const updated = await repo.updateOverlayState(req.params.id, overlay_scene, overlay_round);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'overlay_state_updated', overlay_scene, overlay_round });

    return updated;
  });

  fastify.post('/tournaments/:id/seeds', async (req) => {
    const { player_ids } = req.body;
    if (!Array.isArray(player_ids)) throw fastify.httpErrors.badRequest('player_ids array required');
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    await repo.setSeeds(req.params.id, player_ids);
    await ladderRepo.setSeedMode(req.params.id, 'manual');
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    
    return await repo.getPlayers(req.params.id);
  });

  fastify.post('/tournaments/:id/seeds/auto', async (req) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const seeded = await ladderRepo.autoSeeds(req.params.id);
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    return seeded;
  });

  fastify.post('/tournaments/:id/seeds/randomize', async (req) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const body = req.body || {};
    const options = {};
    if (body.band != null && Number.isFinite(Number(body.band))) {
      options.band = Math.max(0, Math.min(400, Number(body.band)));
    }
    if (body.keep_top != null && Number.isFinite(Number(body.keep_top))) {
      options.keepTop = Math.max(0, Math.min(8, Number(body.keep_top)));
    }
    if (body.keep_bottom != null && Number.isFinite(Number(body.keep_bottom))) {
      options.keepBottom = Math.max(0, Math.min(8, Number(body.keep_bottom)));
    }
    const seeded = await ladderRepo.randomizeSeeds(req.params.id, options);
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    return seeded;
  });

  fastify.post('/tournaments/:id/bracket', async (req) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const bracket = await matches.generateBracket(req.params.id);
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'bracket_generated' });
    
    return bracket;
  });

  fastify.get('/tournaments/:id/bracket', async (req) => {
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return await matches.getByTournament(req.params.id);
  });

  fastify.post('/tournaments/:id/active-match', async (req) => {
    const { active_match_id } = req.body;
    const t = await repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    
    await fastify.db.query(`
      UPDATE axsuck.tournaments SET active_match_id = $1 WHERE id = $2
    `, [active_match_id || null, req.params.id]);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'active_match_updated', active_match_id });

    return await repo.getById(req.params.id);
  });

  fastify.post('/tournaments/:id/import', async (req) => {
    const { id } = req.params;
    const { name, description, status, player_capacity, hold_third_place, scheduled_time, created_at, updated_at, players, matches: rawMatches } = req.body;
    if (player_capacity != null && (!Number.isInteger(Number(player_capacity)) || Number(player_capacity) < 2 || Number(player_capacity) > 128)) {
      throw fastify.httpErrors.badRequest('player_capacity must be between 2 and 128');
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      // 1. Upsert tournament
      await client.query(`
        INSERT INTO axsuck.tournaments (id, name, description, status, player_capacity, hold_third_place, scheduled_time, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT(id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          player_capacity = EXCLUDED.player_capacity,
          hold_third_place = EXCLUDED.hold_third_place,
          scheduled_time = EXCLUDED.scheduled_time,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        id, 
        name, 
        description || '', 
        status || 'completed', 
        player_capacity || 128, 
        hold_third_place ? 1 : 0, 
        scheduled_time || '', 
        created_at || new Date().toISOString(), 
        updated_at || new Date().toISOString()
      ]);

      // Imported historical tournaments keep the source seed order; do not auto-sort them.
      await client.query('UPDATE axsuck.tournaments SET seed_mode = $1 WHERE id = $2', ['manual', id]);

      // 2. Clear existing matches & players mapping for this tournament
      await client.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [id]);
      await client.query('DELETE FROM axsuck.tournament_players WHERE tournament_id = $1', [id]);

      // 3. Insert players & tournament_players
      for (const p of players || []) {
        await client.query(`
          INSERT INTO axsuck.players (id, flag, team, link)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT(id) DO NOTHING
        `, [p.id, p.flag || 'cn', p.team || '', p.link || '']);

        await client.query(`
          INSERT INTO axsuck.tournament_players (tournament_id, player_id, seed, team, flag, link)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(tournament_id, player_id) DO UPDATE SET
            seed = EXCLUDED.seed,
            team = EXCLUDED.team,
            flag = EXCLUDED.flag,
            link = EXCLUDED.link
        `, [id, p.id, p.seed || null, p.team || '', p.flag || 'cn', p.link || '']);
      }

      // 4. Reconstruct matches top-down
      const reconstructedMatches = [];
      const matchInputs = rawMatches || [];
      
      let maxRound = 0;
      for (const m of matchInputs) {
        if (m.round > maxRound) {
          maxRound = m.round;
        }
      }

      if (maxRound > 0) {
        const finalMatch = matchInputs.find(m => m.round === 1);
        if (finalMatch) {
          reconstructedMatches.push({
            round: 1,
            position: 1,
            player1_id: finalMatch.player1_id || null,
            player2_id: finalMatch.player2_id || null,
            score1: finalMatch.score1 || 0,
            score2: finalMatch.score2 || 0,
            winner_id: finalMatch.winner_id || null,
            status: finalMatch.status || 'pending'
          });
        }

        for (let r = 1; r < maxRound; r++) {
          const currentRoundMatches = reconstructedMatches.filter(m => m.round === r);
          for (const parent of currentRoundMatches) {
            if (parent.player1_id) {
              const childMatch = matchInputs.find(m => m.round === r + 1 && (m.player1_id === parent.player1_id || m.player2_id === parent.player1_id));
              if (childMatch) {
                reconstructedMatches.push({
                  round: r + 1,
                  position: parent.position * 2 - 1,
                  player1_id: childMatch.player1_id || null,
                  player2_id: childMatch.player2_id || null,
                  score1: childMatch.score1 || 0,
                  score2: childMatch.score2 || 0,
                  winner_id: childMatch.winner_id || null,
                  status: childMatch.status || 'pending'
                });
              } else {
                reconstructedMatches.push({
                  round: r + 1,
                  position: parent.position * 2 - 1,
                  player1_id: parent.player1_id,
                  player2_id: null,
                  score1: 0,
                  score2: 0,
                  winner_id: parent.player1_id,
                  status: 'completed'
                });
              }
            }

            if (parent.player2_id) {
              const childMatch = matchInputs.find(m => m.round === r + 1 && (m.player1_id === parent.player2_id || m.player2_id === parent.player2_id));
              if (childMatch) {
                reconstructedMatches.push({
                  round: r + 1,
                  position: parent.position * 2,
                  player1_id: childMatch.player1_id || null,
                  player2_id: childMatch.player2_id || null,
                  score1: childMatch.score1 || 0,
                  score2: childMatch.score2 || 0,
                  winner_id: childMatch.winner_id || null,
                  status: childMatch.status || 'pending'
                });
              } else {
                reconstructedMatches.push({
                  round: r + 1,
                  position: parent.position * 2,
                  player1_id: parent.player2_id,
                  player2_id: null,
                  score1: 0,
                  score2: 0,
                  winner_id: parent.player2_id,
                  status: 'completed'
                });
              }
            }
          }
        }
      }

      const thirdPlaceMatch = matchInputs.find(m => m.round === 0);
      if (thirdPlaceMatch) {
        reconstructedMatches.push({
          round: 0,
          position: 1,
          player1_id: thirdPlaceMatch.player1_id || null,
          player2_id: thirdPlaceMatch.player2_id || null,
          score1: thirdPlaceMatch.score1 || 0,
          score2: thirdPlaceMatch.score2 || 0,
          winner_id: thirdPlaceMatch.winner_id || null,
          status: thirdPlaceMatch.status || 'pending'
        });
      }

      for (const m of reconstructedMatches) {
        await client.query(`
          INSERT INTO axsuck.matches (tournament_id, round, position, player1_id, player2_id, score1, score2, winner_id, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          id,
          m.round,
          m.position,
          m.player1_id,
          m.player2_id,
          m.score1,
          m.score2,
          m.winner_id,
          m.status
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${id}`, { type: 'imported' });

    return { success: true };
  });

  fastify.delete('/tournaments/:id', async (req) => {
    const { id } = req.params;
    const t = await repo.getById(id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    await fastify.db.query('DELETE FROM axsuck.matches WHERE tournament_id = $1', [id]);
    await fastify.db.query('DELETE FROM axsuck.tournament_players WHERE tournament_id = $1', [id]);
    await fastify.db.query('DELETE FROM axsuck.tournaments WHERE id = $1', [id]);
    return { success: true };
  });

}
