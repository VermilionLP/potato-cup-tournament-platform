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
