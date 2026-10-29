// Player profiles: list / detail, activity, create or update, rename (as a
// merge into a new ID), delete and merge. Device keys are in
// player-keys.js, registrations in registrations.js, statistics in
// player-stats.js.

import { PlayerRepo, mergePlayerInto } from '../repositories/player-repo.js';
import { isAdminRequest, requireAdmin, requireSelfOrAdmin } from '../lib/admin.js';
import { contactProblem, parseContact, CONTACT_REQUIRED } from '../lib/contact.js';
import { inTransaction } from '../lib/transaction.js';

export default async function playersRoutes(fastify) {
  const repo = PlayerRepo(fastify.db);

  // Profile changes show on every event that isn't finished yet.
  async function notifyActiveEvents(message) {
    const { rows } = await fastify.db.query("SELECT id FROM axsuck.tournaments WHERE status != 'completed'");
    for (const t of rows) fastify.tournamentEvents.emit(`update:${t.id}`, message);
  }

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

  fastify.post('/players/:id/change-id', async (req) => {
    requireAdmin(fastify, req);
    const { id: oldId } = req.params;
    const { newId } = req.body;
    if (!newId) throw fastify.httpErrors.badRequest('newId is required');

    const existing = await repo.getById(newId);
    if (existing) throw fastify.httpErrors.conflict('New Player ID already exists');

    const oldPlayer = await repo.getById(oldId);
    if (!oldPlayer) throw fastify.httpErrors.notFound('Old player not found');

    // A rename is a merge into a fresh record: everything (registrations,
    // matches, votes, device key, profile) moves over and the old
    // id is kept as an alias (player_aliases).
    await inTransaction(fastify.db, async (client) => {
      await client.query('INSERT INTO axsuck.players (id, flag) VALUES ($1, $2)', [newId, '']);
      await mergePlayerInto(client, oldId, newId);
      await client.query('UPDATE axsuck.players SET last_ip = $2 WHERE id = $1', [newId, oldPlayer.last_ip || null]);
    });

    await notifyActiveEvents({ type: 'player_id_changed', oldId, newId });

    return { success: true, oldId, newId };
  });

  fastify.delete('/players/:id', async (req) => {
    requireAdmin(fastify, req);
    const { id } = req.params;
    
    const p = await repo.getById(id);
    if (!p) throw fastify.httpErrors.notFound('Player not found');

    // Players who have played can only be merged, not deleted.
    const { rows: played } = await fastify.db.query(
      'SELECT 1 FROM axsuck.matches WHERE player1_id = $1 OR player2_id = $1 OR winner_id = $1 LIMIT 1',
      [id]
    );
    if (played.length > 0) {
      throw fastify.httpErrors.badRequest('该选手已经在对阵比赛中出场，无法直接删除。请使用“合并选手”功能将此选手合并到正确的选手中。');
    }

    await inTransaction(fastify.db, async (client) => {
      await client.query('DELETE FROM axsuck.tournament_players WHERE player_id = $1', [id]);
      await client.query('DELETE FROM axsuck.time_votes WHERE player_id = $1', [id]);
      await client.query('DELETE FROM axsuck.custom_votes WHERE player_id = $1', [id]);
      await client.query('DELETE FROM axsuck.players WHERE id = $1', [id]);
    });

    await notifyActiveEvents({ type: 'player_deleted', id });

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

    await inTransaction(fastify.db, (client) => mergePlayerInto(client, oldId, targetId));

    await notifyActiveEvents({ type: 'player_merged', oldId, targetId });

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
    // Contact: valid when given; players saving their own profile need one.
    const contact = parseContact(battleTagsStr);
    const problem = contactProblem(contact);
    if (problem) throw fastify.httpErrors.badRequest(problem);
    if (!contact.qq && !contact.discord && !isAdminRequest(req)) {
      throw fastify.httpErrors.badRequest(CONTACT_REQUIRED);
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
      await notifyActiveEvents({ type: 'player_updated', id });
    }

    return updatedPlayer;
  });
}
