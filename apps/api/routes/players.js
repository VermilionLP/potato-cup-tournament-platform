// Player profiles: list / detail, activity, create or update, rename (as a
// merge into a new ID), delete and merge. Device keys are in
// player-keys.js, registrations in registrations.js, statistics in
// player-stats.js.

import { cached } from '../lib/ladder-cache.js';
import { duplicatePairs, lookupPlayerName } from '../lib/player-lookup.js';
import { PlayerRepo, mergePlayerInto } from '../repositories/player-repo.js';
import { canSeeContactsRequest, isAdminRequest, requireAdmin, requireSelfOrAdmin } from '../lib/admin.js';
import { contactProblem, parseContact, CONTACT_REQUIRED } from '../lib/contact.js';
import { inTransaction } from '../lib/transaction.js';
import { contactFor, publicPlayer } from '../lib/player-privacy.js';

export default async function playersRoutes(fastify) {
  const repo = PlayerRepo(fastify.db);

  // Profile changes show on every event that isn't finished yet.
  async function notifyActiveEvents(message) {
    const { rows } = await fastify.db.query("SELECT id FROM axsuck.tournaments WHERE status != 'completed'");
    for (const t of rows) fastify.tournamentEvents.emit(`update:${t.id}`, message);
  }

  // IP addresses only for admins, QQ / Discord only for signed-in players
  // and admins (lib/player-privacy.js).
  fastify.get('/players', async (req) => {
    const admin = isAdminRequest(req);
    const contacts = await canSeeContactsRequest(fastify, req);
    return (await repo.list()).map((p) => contactFor(publicPlayer(p, admin), contacts));
  });

  // Every player's event count, last event and key, cached like the ladder
  // (dropped after any write, 5 minutes at most): the lookup runs while
  // people type. Used by the sign-in lookup and the duplicate finder.
  function playerIndex() {
    return cached(fastify.db, 'player-lookup', async () => {
      const [rowsRes, aliasRes] = await Promise.all([
        fastify.db.query(`
          WITH played AS (
            SELECT player_id, tournament_id FROM axsuck.tournament_players
            UNION SELECT player1_id, tournament_id FROM axsuck.matches WHERE player1_id IS NOT NULL
            UNION SELECT player2_id, tournament_id FROM axsuck.matches WHERE player2_id IS NOT NULL
          ), last_event AS (
            SELECT DISTINCT ON (pl.player_id) pl.player_id, t.name
            FROM played pl JOIN axsuck.tournaments t ON t.id = pl.tournament_id
            ORDER BY pl.player_id, COALESCE(t.played_at, t.created_at) DESC
          )
          SELECT p.id, p.last_seen_at,
                 (SELECT COUNT(DISTINCT tournament_id)::int FROM played WHERE player_id = p.id) AS events,
                 le.name AS last_event,
                 EXISTS (SELECT 1 FROM axsuck.player_keys k WHERE k.player_id = p.id) AS key_bound
          FROM axsuck.players p
          LEFT JOIN last_event le ON le.player_id = p.id
        `),
        fastify.db.query('SELECT alias, player_id FROM axsuck.player_aliases'),
      ]);
      return { rows: rowsRes.rows, aliases: aliasRes.rows };
    });
  }

  // Sign-in help: whether a typed name is already a player (exactly, as an
  // old ID, or nearly), with how many events they played. No contact data.
  fastify.get('/players/lookup', async (req) => {
    const name = String(req.query?.name || '').trim().slice(0, 64);
    if (!name) return { exact: null, alias: null, similar: [] };
    const { rows, aliases } = await playerIndex();
    return lookupPlayerName(name, rows, aliases);
  });

  // Admins: likely duplicate players (lib/player-lookup.js duplicatePairs),
  // without the pairs marked as different people.
  fastify.get('/players/duplicates', async (req) => {
    requireAdmin(fastify, req);
    const [{ rows }, dismissed] = await Promise.all([
      playerIndex(),
      fastify.db.query('SELECT player_a, player_b FROM axsuck.player_not_duplicates'),
    ]);
    return { pairs: duplicatePairs(rows, dismissed.rows.map((r) => [r.player_a, r.player_b])) };
  });

  // Admins: "not the same person" for a suggested pair.
  fastify.post('/players/not-duplicates', async (req) => {
    requireAdmin(fastify, req);
    const ids = [String(req.body?.a || ''), String(req.body?.b || '')].sort();
    if (!ids[0] || !ids[1] || ids[0] === ids[1]) throw fastify.httpErrors.badRequest('a and b must be two player IDs');
    await fastify.db.query(
      'INSERT INTO axsuck.player_not_duplicates (player_a, player_b) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      ids,
    );
    return { ok: true };
  });

  fastify.get('/players/:id', async (req) => {
    const p = await repo.getById(req.params.id);
    if (!p) throw fastify.httpErrors.notFound('Player not found');
    return {
      ...contactFor(publicPlayer(p, isAdminRequest(req)), await canSeeContactsRequest(fastify, req)),
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
