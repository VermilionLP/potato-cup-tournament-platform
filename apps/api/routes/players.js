import { PlayerRepo } from '../repositories/player-repo.js';
import { TournamentRepo } from '../repositories/tournament-repo.js';

export default async function playersRoutes(fastify) {
  const repo = PlayerRepo(fastify.db);
  const tourneyRepo = TournamentRepo(fastify.db);

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
    const { id, display_name, flag, team, alias, link, bnet_ids, tournament_id } = req.body;
    if (!id) throw fastify.httpErrors.badRequest('id is required');

    let bnetIdsStr = '[]';
    if (bnet_ids) {
      bnetIdsStr = typeof bnet_ids === 'string' ? bnet_ids : JSON.stringify(bnet_ids);
    }

    const updatedPlayer = repo.upsert(id, display_name || id, flag, team, alias, link, bnetIdsStr);

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

    repo.upsert(player_id, player_id);
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
