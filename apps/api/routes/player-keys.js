// Device keys (lib/player-key.js): a player binds their ID to one device;
// admins can see whether an ID is bound and unbind it.

import { PlayerRepo } from '../repositories/player-repo.js';
import { getRequesterId, requireAdmin } from '../lib/admin.js';
import { hashPlayerKey, newPlayerKey, playerKeyMatches, requestPlayerKey, storedKeyHash } from '../lib/player-key.js';

export default async function playerKeyRoutes(fastify) {
  const repo = PlayerRepo(fastify.db);

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
}
