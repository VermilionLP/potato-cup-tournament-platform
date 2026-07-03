import { TournamentRepo } from '../repositories/tournament-repo.js';
import { MatchRepo } from '../repositories/match-repo.js';
import { Readable } from 'stream';
import { getPlayerInfoFromReplay } from './replays.js';

export default async function tournamentsRoutes(fastify) {
  const repo = TournamentRepo(fastify.db);
  const matches = MatchRepo(fastify.db);

  fastify.get('/tournaments', async () => {
    return repo.list();
  });

  fastify.get('/tournaments/:id', async (req) => {
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    
    const players = repo.getPlayers(req.params.id);
    const ms = repo.getMatches(req.params.id);
    const votes = repo.getVotes(req.params.id);
    const custom_votes = repo.getCustomVotes(req.params.id);

    // Dynamically retrieve player races from uploaded replays
    const matchIds = ms.map(m => m.id);
    const replays = matchIds.length > 0
      ? fastify.db.prepare(`SELECT * FROM match_replays WHERE match_id IN (${matchIds.join(',')})`).all()
      : [];

    const playerRaces = {};
    for (const p of players) {
      playerRaces[p.id] = {};
    }

    for (const r of replays) {
      let parsedData;
      try {
        parsedData = JSON.parse(r.parsed_data);
      } catch (_) {
        continue;
      }
      for (const p of players) {
        const repInfo = getPlayerInfoFromReplay(
          p.id,
          p.display_name,
          p.battle_tags,
          p.bnet_ids,
          parsedData
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
        race: detectedRace
      };
    });

    return {
      ...t,
      players: playersWithRace,
      matches: ms,
      votes,
      custom_votes
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

  fastify.post('/tournaments', async (req) => {
    const { id, name, description, player_capacity, hold_third_place, loser_advances } = req.body;
    if (!id || !name) throw fastify.httpErrors.badRequest('id and name are required');
    const existing = repo.getById(id);
    if (existing) throw fastify.httpErrors.conflict('Tournament ID already exists');
    return repo.create({ id, name, description, player_capacity, hold_third_place, loser_advances });
  });

  fastify.post('/tournaments/:id/status', async (req) => {
    const { status, scheduled_time, created_at, updated_at } = req.body;
    const valid = ['registration', 'voting', 'in_progress', 'completed'];
    if (!valid.includes(status)) throw fastify.httpErrors.badRequest('Invalid status');
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');

    const db = fastify.db;
    const tx = db.transaction(() => {
      if (status === 'registration' || status === 'voting') {
        db.prepare('UPDATE tournaments SET active_match_id = NULL WHERE id = ?').run(req.params.id);
        db.prepare('DELETE FROM matches WHERE tournament_id = ?').run(req.params.id);
      }
      repo.updateStatus(req.params.id, status, scheduled_time, created_at, updated_at);
    });
    tx();

    const updated = repo.getById(req.params.id);
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'status_changed', status });
    
    return updated;
  });

  fastify.post('/tournaments/:id/overlay-state', async (req) => {
    const { overlay_scene, overlay_round } = req.body;
    const valid = ['auto', 'intro', 'ingame', 'intermission', 'hybrid'];
    if (overlay_scene && !valid.includes(overlay_scene)) throw fastify.httpErrors.badRequest('Invalid overlay_scene');
    
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');

    const updated = repo.updateOverlayState(req.params.id, overlay_scene, overlay_round);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'overlay_state_updated', overlay_scene, overlay_round });

    return updated;
  });

  fastify.post('/tournaments/:id/seeds', async (req) => {
    const { player_ids } = req.body;
    if (!Array.isArray(player_ids)) throw fastify.httpErrors.badRequest('player_ids array required');
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    repo.setSeeds(req.params.id, player_ids);
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'seeds_updated' });
    
    return repo.getPlayers(req.params.id);
  });

  fastify.post('/tournaments/:id/bracket', async (req) => {
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    const bracket = matches.generateBracket(req.params.id);
    
    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'bracket_generated' });
    
    return bracket;
  });

  fastify.get('/tournaments/:id/bracket', async (req) => {
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return matches.getByTournament(req.params.id);
  });

  fastify.post('/tournaments/:id/active-match', async (req) => {
    const { active_match_id } = req.body;
    const t = repo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    
    fastify.db.prepare(`
      UPDATE tournaments SET active_match_id = ? WHERE id = ?
    `).run(active_match_id || null, req.params.id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'active_match_updated', active_match_id });

    return repo.getById(req.params.id);
  });

  fastify.post('/tournaments/:id/import', async (req) => {
    const { id } = req.params;
    const { name, description, status, player_capacity, hold_third_place, scheduled_time, created_at, updated_at, players, matches } = req.body;

    const db = fastify.db;
    const tx = db.transaction(() => {
      // 1. Upsert tournament
      db.prepare(`
        INSERT INTO tournaments (id, name, description, status, player_capacity, hold_third_place, scheduled_time, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          description=excluded.description,
          status=excluded.status,
          player_capacity=excluded.player_capacity,
          hold_third_place=excluded.hold_third_place,
          scheduled_time=excluded.scheduled_time,
          created_at=excluded.created_at,
          updated_at=excluded.updated_at
      `).run(
        id, 
        name, 
        description || '', 
        status || 'completed', 
        player_capacity || 16, 
        hold_third_place ? 1 : 0, 
        scheduled_time || '', 
        created_at || new Date().toISOString().slice(0, 19).replace('T', ' '), 
        updated_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      );

      // 2. Clear existing matches & players mapping for this tournament
      db.prepare('DELETE FROM matches WHERE tournament_id = ?').run(id);
      db.prepare('DELETE FROM tournament_players WHERE tournament_id = ?').run(id);

      // 3. Insert players & tournament_players (ON CONFLICT DO NOTHING to avoid overwriting existing players)
      const insertPlayer = db.prepare(`
        INSERT INTO players (id, flag, team, link)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `);
      const insertTourneyPlayer = db.prepare(`
        INSERT INTO tournament_players (tournament_id, player_id, seed, team, flag, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const p of players || []) {
        insertPlayer.run(p.id, p.flag || 'cn', p.team || '', p.link || '');
        insertTourneyPlayer.run(id, p.id, p.seed || null, p.team || '', p.flag || 'cn', p.link || '');
      }

      // 4. Reconstruct matches top-down to correctly assign position and insert byes
      const reconstructedMatches = [];
      const rawMatches = matches || [];
      
      // Find max round in the main bracket (excluding round 0)
      let maxRound = 0;
      for (const m of rawMatches) {
        if (m.round > maxRound) {
          maxRound = m.round;
        }
      }

      if (maxRound > 0) {
        // Find the final match (round 1)
        const finalMatch = rawMatches.find(m => m.round === 1);
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

        // Reconstruct from round 1 up to maxRound
        for (let r = 1; r < maxRound; r++) {
          const currentRoundMatches = reconstructedMatches.filter(m => m.round === r);
          for (const parent of currentRoundMatches) {
            // Player 1 side (position * 2 - 1)
            if (parent.player1_id) {
              const childMatch = rawMatches.find(m => m.round === r + 1 && (m.player1_id === parent.player1_id || m.player2_id === parent.player1_id));
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
                // BYE match
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

            // Player 2 side (position * 2)
            if (parent.player2_id) {
              const childMatch = rawMatches.find(m => m.round === r + 1 && (m.player1_id === parent.player2_id || m.player2_id === parent.player2_id));
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
                // BYE match
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

      // Add the 3rd place match (round 0) if it exists
      const thirdPlaceMatch = rawMatches.find(m => m.round === 0);
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

      // 5. Insert matches directly
      const insertMatch = db.prepare(`
        INSERT INTO matches (tournament_id, round, position, player1_id, player2_id, score1, score2, winner_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of reconstructedMatches) {
        insertMatch.run(
          id,
          m.round,
          m.position,
          m.player1_id,
          m.player2_id,
          m.score1,
          m.score2,
          m.winner_id,
          m.status
        );
      }
    });

    tx();

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${id}`, { type: 'imported' });

    return { success: true };
  });
}
