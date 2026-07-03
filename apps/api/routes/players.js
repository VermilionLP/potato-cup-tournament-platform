import { PlayerRepo } from '../repositories/player-repo.js';
import { TournamentRepo } from '../repositories/tournament-repo.js';
import { getPlayerInfoFromReplay } from './replays.js';

export default async function playersRoutes(fastify) {
  const repo = PlayerRepo(fastify.db);
  const tourneyRepo = TournamentRepo(fastify.db);

  fastify.get('/players/statistics', async () => {
    const db = fastify.db;
    const players = repo.list();
    const registrations = db.prepare('SELECT * FROM tournament_players').all();
    const matches = db.prepare("SELECT * FROM matches WHERE status IN ('completed', 'walkover')").all();
    const replays = db.prepare('SELECT match_id, winner, map_name, game_length, parsed_data FROM match_replays').all();
    const tournaments = db.prepare('SELECT id, name FROM tournaments').all();
    const tournamentMap = {};
    for (const t of tournaments) tournamentMap[t.id] = t.name;

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
        replays_count: 0,
        total_game_time: 0,
        game_time_count: 0,
        maps_played: 0,
        maps_won: 0,
        maps_lost: 0,
        races_used: {},
        vs_race: {
          Z: { won: 0, total: 0 },
          T: { won: 0, total: 0 },
          P: { won: 0, total: 0 },
          R: { won: 0, total: 0 }
        },
        opponents: {},
        tournament_ids: []
      };
    }

    for (const reg of registrations) {
      if (stats[reg.player_id]) {
        stats[reg.player_id].tournaments_played++;
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

    const replayMap = {};
    for (const r of replays) {
      if (!replayMap[r.match_id]) replayMap[r.match_id] = [];
      replayMap[r.match_id].push(r);
    }

    const playerLookup = {};
    for (const p of players) {
      playerLookup[p.id] = p;
    }

    const mapUsage = {};

    for (const m of matches) {
      const p1 = m.player1_id;
      const p2 = m.player2_id;
      if (!p1 || !p2) continue;

      const reps = replayMap[m.id] || [];
      const pl1 = playerLookup[p1];
      const pl2 = playerLookup[p2];

      for (const r of reps) {
        let parsedData;
        try {
          parsedData = JSON.parse(r.parsed_data);
        } catch (_) {
          continue;
        }

        const repInfo1 = getPlayerInfoFromReplay(p1, pl1.display_name, pl1.battle_tags, pl1.bnet_ids, parsedData);
        const repInfo2 = getPlayerInfoFromReplay(p2, pl2.display_name, pl2.battle_tags, pl2.bnet_ids, parsedData);

        const race1 = repInfo1?.race ? repInfo1.race[0].toUpperCase() : 'U';
        const race2 = repInfo2?.race ? repInfo2.race[0].toUpperCase() : 'U';

        if (r.map_name) {
          mapUsage[r.map_name] = (mapUsage[r.map_name] || 0) + 1;
        }

        if (stats[p1]) {
          stats[p1].replays_count++;
          if (r.game_length) {
            stats[p1].total_game_time += r.game_length;
            stats[p1].game_time_count++;
          }
          if (race1 !== 'U') {
            stats[p1].races_used[race1] = (stats[p1].races_used[race1] || 0) + 1;
          }

          const won = r.winner === repInfo1?.name;
          if (race2 !== 'U') {
            if (!stats[p1].vs_race[race2]) {
              stats[p1].vs_race[race2] = { won: 0, total: 0 };
            }
            stats[p1].vs_race[race2].total++;
            if (won) stats[p1].vs_race[race2].won++;
          }
        }

        if (stats[p2]) {
          stats[p2].replays_count++;
          if (r.game_length) {
            stats[p2].total_game_time += r.game_length;
            stats[p2].game_time_count++;
          }
          if (race2 !== 'U') {
            stats[p2].races_used[race2] = (stats[p2].races_used[race2] || 0) + 1;
          }

          const won = r.winner === repInfo2?.name;
          if (race1 !== 'U') {
            if (!stats[p2].vs_race[race1]) {
              stats[p2].vs_race[race1] = { won: 0, total: 0 };
            }
            stats[p2].vs_race[race1].total++;
            if (won) stats[p2].vs_race[race1].won++;
          }
        }
      }
    }

    const playerStats = Object.values(stats).map(s => {
      let nemesis = null;
      let maxLostMatches = 0;
      let nemesisDisp = '';

      let favorite = null;
      let maxWonMatches = 0;
      let favoriteDisp = '';

      for (const [oppId, o] of Object.entries(s.opponents)) {
        if (o.lost_matches > maxLostMatches) {
          maxLostMatches = o.lost_matches;
          nemesis = oppId;
          nemesisDisp = playerLookup[oppId]?.display_name || oppId;
        }
        if (o.won_matches > maxWonMatches) {
          maxWonMatches = o.won_matches;
          favorite = oppId;
          favoriteDisp = playerLookup[oppId]?.display_name || oppId;
        }
      }

      const sortedRaces = Object.entries(s.races_used).sort((a, b) => b[1] - a[1]);
      const mainRace = sortedRaces.length > 0 ? sortedRaces[0][0] : 'U';

      return {
        id: s.id,
        display_name: s.display_name,
        team: s.team,
        flag: s.flag,
        main_race: mainRace,
        tournaments_played: s.tournaments_played,
        matches_played: s.matches_played,
        matches_won: s.matches_won,
        matches_lost: s.matches_lost,
        match_win_rate: s.matches_played > 0 ? (s.matches_won / s.matches_played) : 0,
        walkover_wins: s.walkover_wins,
        walkover_losses: s.walkover_losses,
        replays_count: s.replays_count,
        maps_played: s.maps_played,
        maps_won: s.maps_won,
        maps_lost: s.maps_lost,
        map_win_rate: s.maps_played > 0 ? (s.maps_won / s.maps_played) : 0,
        avg_game_length: s.game_time_count > 0 ? Math.round(s.total_game_time / s.game_time_count) : 0,
        vs_race: s.vs_race,
        nemesis: nemesis ? { id: nemesis, display_name: nemesisDisp, count: maxLostMatches } : null,
        favorite: favorite ? { id: favorite, display_name: favoriteDisp, count: maxWonMatches } : null,
        tournaments: s.tournament_ids.map(tid => ({ id: tid, name: tournamentMap[tid] || tid }))
      };
    });

    const totalTournaments = db.prepare('SELECT COUNT(*) as count FROM tournaments').get().count;
    const totalMatches = db.prepare("SELECT COUNT(*) as count FROM matches WHERE status != 'pending'").get().count;
    const totalReplays = db.prepare('SELECT COUNT(*) as count FROM match_replays').get().count;
    const avgReplayLengthObj = db.prepare('SELECT AVG(game_length) as avg FROM match_replays WHERE game_length > 0').get();
    const globalAvgReplayLength = avgReplayLengthObj ? Math.round(avgReplayLengthObj.avg || 0) : 0;

    const topMaps = Object.entries(mapUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const withGames = playerStats.filter(p => p.avg_game_length > 0);
    const longestPlayer = withGames.length > 0
      ? withGames.reduce((a, b) => a.avg_game_length > b.avg_game_length ? a : b)
      : null;
    const shortestPlayer = withGames.length > 0
      ? withGames.reduce((a, b) => a.avg_game_length < b.avg_game_length ? a : b)
      : null;

    const eligibleForRate = playerStats.filter(p => p.matches_played >= 5);

    return {
      players: playerStats,
      global: {
        total_players: players.length,
        total_tournaments: totalTournaments,
        total_matches: totalMatches,
        total_replays: totalReplays,
        avg_game_length: globalAvgReplayLength,
        top_maps: topMaps
      },
      rankings: {
        by_win_rate: [...eligibleForRate]
          .sort((a, b) => b.match_win_rate - a.match_win_rate)
          .slice(0, 5),
        by_played: [...playerStats]
          .sort((a, b) => b.matches_played - a.matches_played)
          .slice(0, 5),
        by_walkover: [...playerStats]
          .filter(p => p.walkover_losses > 0)
          .sort((a, b) => b.walkover_losses - a.walkover_losses)
          .slice(0, 5),
        longest_player: longestPlayer,
        shortest_player: longestPlayer !== shortestPlayer ? shortestPlayer : null
      }
    };
  });

  fastify.get('/players', async () => {
    return repo.list();
  });

  fastify.get('/players/:id', async (req) => {
    const p = repo.getById(req.params.id);
    if (!p) throw fastify.httpErrors.notFound('Player not found');
    return {
      ...p,
      tournaments: repo.getTournaments(req.params.id)
    };
  });

  fastify.post('/players/:id/change-id', async (req) => {
    const { id: oldId } = req.params;
    const { newId } = req.body;
    if (!newId) throw fastify.httpErrors.badRequest('newId is required');

    const db = fastify.db;
    const existing = db.prepare('SELECT 1 FROM players WHERE id = ?').get(newId);
    if (existing) throw fastify.httpErrors.conflict('New Player ID already exists');

    // Run rename in a transaction with foreign keys disabled temporarily
    db.prepare('PRAGMA foreign_keys = OFF').run();
    try {
      db.transaction(() => {
        db.prepare('UPDATE players SET id = ? WHERE id = ?').run(newId, oldId);
        db.prepare('UPDATE tournament_players SET player_id = ? WHERE player_id = ?').run(newId, oldId);
        db.prepare('UPDATE matches SET player1_id = ? WHERE player1_id = ?').run(newId, oldId);
        db.prepare('UPDATE matches SET player2_id = ? WHERE player2_id = ?').run(newId, oldId);
        db.prepare('UPDATE matches SET winner_id = ? WHERE winner_id = ?').run(newId, oldId);
        db.prepare('UPDATE time_votes SET player_id = ? WHERE player_id = ?').run(newId, oldId);
      })();
    } finally {
      db.prepare('PRAGMA foreign_keys = ON').run();
    }

    // Trigger global update to all active tournaments
    const activeTournaments = db.prepare("SELECT id FROM tournaments WHERE status != 'completed'").all();
    activeTournaments.forEach(t => {
      fastify.tournamentEvents.emit(`update:${t.id}`, { type: 'player_id_changed', oldId, newId });
    });

    return { success: true, oldId, newId };
  });

  fastify.delete('/players/:id', async (req) => {
    const { id } = req.params;
    const db = fastify.db;
    
    const p = repo.getById(id);
    if (!p) throw fastify.httpErrors.notFound('Player not found');

    // Check if player has match appearances
    const matchCountObj = db.prepare('SELECT COUNT(*) as count FROM matches WHERE player1_id = ? OR player2_id = ? OR winner_id = ?').get(id, id, id);
    if (matchCountObj && matchCountObj.count > 0) {
      throw fastify.httpErrors.badRequest('该选手已经在对阵比赛中出场，无法直接删除。请使用“合并选手”功能将此选手合并到正确的选手中。');
    }

    db.transaction(() => {
      db.prepare('DELETE FROM tournament_players WHERE player_id = ?').run(id);
      db.prepare('DELETE FROM time_votes WHERE player_id = ?').run(id);
      db.prepare('DELETE FROM players WHERE id = ?').run(id);
    })();

    const activeTournaments = db.prepare("SELECT id FROM tournaments WHERE status != 'completed'").all();
    activeTournaments.forEach(t => {
      fastify.tournamentEvents.emit(`update:${t.id}`, { type: 'player_deleted', id });
    });

    return { success: true };
  });

  fastify.post('/players/:id/merge', async (req) => {
    const { id: oldId } = req.params;
    const { targetId } = req.body;
    if (!targetId) throw fastify.httpErrors.badRequest('targetId is required');

    const db = fastify.db;
    
    const oldPlayer = repo.getById(oldId);
    const targetPlayer = repo.getById(targetId);
    if (!oldPlayer) throw fastify.httpErrors.notFound('Source player not found');
    if (!targetPlayer) throw fastify.httpErrors.notFound('Target player not found');
    if (oldId === targetId) throw fastify.httpErrors.badRequest('Cannot merge a player into themselves');

    db.transaction(() => {
      // 1. Merge tournament_players
      const oldRegistrations = db.prepare('SELECT tournament_id, seed, registered_at FROM tournament_players WHERE player_id = ?').all(oldId);
      for (const reg of oldRegistrations) {
        const targetExists = db.prepare('SELECT 1 FROM tournament_players WHERE tournament_id = ? AND player_id = ?').get(reg.tournament_id, targetId);
        if (!targetExists) {
          db.prepare('UPDATE tournament_players SET player_id = ? WHERE tournament_id = ? AND player_id = ?').run(targetId, reg.tournament_id, oldId);
        } else {
          db.prepare('DELETE FROM tournament_players WHERE tournament_id = ? AND player_id = ?').run(reg.tournament_id, oldId);
        }
      }

      // 2. Merge time_votes
      const oldVotes = db.prepare('SELECT tournament_id, proposed_time FROM time_votes WHERE player_id = ?').all(oldId);
      for (const vote of oldVotes) {
        const targetVoteExists = db.prepare('SELECT 1 FROM time_votes WHERE tournament_id = ? AND player_id = ? AND proposed_time = ?')
          .get(vote.tournament_id, targetId, vote.proposed_time);
        if (!targetVoteExists) {
          db.prepare('UPDATE time_votes SET player_id = ? WHERE tournament_id = ? AND player_id = ? AND proposed_time = ?')
            .run(targetId, vote.tournament_id, oldId, vote.proposed_time);
        } else {
          db.prepare('DELETE FROM time_votes WHERE tournament_id = ? AND player_id = ? AND proposed_time = ?')
            .run(vote.tournament_id, oldId, vote.proposed_time);
        }
      }

      // 3. Merge matches
      db.prepare('UPDATE matches SET player1_id = ? WHERE player1_id = ?').run(targetId, oldId);
      db.prepare('UPDATE matches SET player2_id = ? WHERE player2_id = ?').run(targetId, oldId);
      db.prepare('UPDATE matches SET winner_id = ? WHERE winner_id = ?').run(targetId, oldId);

      // 4. Merge bnet_ids
      let targetBnet = [];
      try {
        targetBnet = JSON.parse(targetPlayer.bnet_ids || '[]');
      } catch (e) {}
      let oldBnet = [];
      try {
        oldBnet = JSON.parse(oldPlayer.bnet_ids || '[]');
      } catch (e) {}
      
      const mergedBnet = [...targetBnet];
      oldBnet.forEach(item => {
        const itemId = typeof item === 'string' ? item : item.id;
        const exists = mergedBnet.some(t => (typeof t === 'string' ? t : t.id) === itemId);
        if (!exists) {
          mergedBnet.push(item);
        }
      });
      db.prepare('UPDATE players SET bnet_ids = ? WHERE id = ?').run(JSON.stringify(mergedBnet), targetId);

      // 5. Delete old player
      db.prepare('DELETE FROM players WHERE id = ?').run(oldId);
    })();

    const activeTournaments = db.prepare("SELECT id FROM tournaments WHERE status != 'completed'").all();
    activeTournaments.forEach(t => {
      fastify.tournamentEvents.emit(`update:${t.id}`, { type: 'player_merged', oldId, targetId });
    });

    return { success: true };
  });

  fastify.post('/players', async (req) => {
    const { id, flag, team, link, battle_tags, bnet_ids, tournament_id } = req.body;
    if (!id) throw fastify.httpErrors.badRequest('id is required');

    let battleTagsStr = '{}';
    if (battle_tags) {
      battleTagsStr = typeof battle_tags === 'string' ? battle_tags : JSON.stringify(battle_tags);
    }

    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    const lastIp = (requesterId === id) ? req.ip : null;
    const updatedPlayer = repo.upsert(id, flag, team, link, battleTagsStr, lastIp);

    if (bnet_ids !== undefined) {
      const bnetIdsStr = typeof bnet_ids === 'string' ? bnet_ids : JSON.stringify(bnet_ids);
      fastify.db.prepare('UPDATE players SET bnet_ids = ? WHERE id = ?').run(bnetIdsStr, id);
      updatedPlayer.bnet_ids = bnetIdsStr;
    }

    if (tournament_id) {
      fastify.db.prepare(`
        UPDATE tournament_players 
        SET team = ?
        WHERE tournament_id = ? AND player_id = ?
      `).run(team || '', tournament_id, id);

      // Trigger real-time broadcast
      fastify.tournamentEvents.emit(`update:${tournament_id}`, { type: 'player_updated', id });
    } else {
      // If global profile edit, broadcast to active tournaments
      const activeTournaments = fastify.db.prepare("SELECT id FROM tournaments WHERE status != 'completed'").all();
      activeTournaments.forEach(t => {
        fastify.tournamentEvents.emit(`update:${t.id}`, { type: 'player_updated', id });
      });
    }

    return updatedPlayer;
  });

  fastify.post('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');

    const t = tourneyRepo.getById(req.params.id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    if (t.status !== 'registration') throw fastify.httpErrors.badRequest('Registration is closed');

    const existingPlayer = repo.getById(player_id);
    const requesterIdRaw = req.headers['x-player-id'];
    const requesterId = requesterIdRaw ? decodeURIComponent(requesterIdRaw) : undefined;
    const lastIp = (requesterId === player_id) ? req.ip : null;

    if (!existingPlayer) {
      repo.upsert(player_id, 'cn', '', '', '{}', lastIp);
    } else {
      if (requesterId === player_id) {
        fastify.db.prepare('UPDATE players SET last_ip = ? WHERE id = ?').run(req.ip, player_id);
      }
    }
    const added = tourneyRepo.addPlayer(req.params.id, player_id);
    if (!added) throw fastify.httpErrors.conflict('Already registered');

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'player_registered', player_id });

    return tourneyRepo.getPlayers(req.params.id);
  });

  fastify.delete('/tournaments/:id/register', async (req) => {
    const { player_id } = req.body;
    if (!player_id) throw fastify.httpErrors.badRequest('player_id is required');
    tourneyRepo.removePlayer(req.params.id, player_id);

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${req.params.id}`, { type: 'player_unregistered', player_id });

    return { success: true };
  });
}
