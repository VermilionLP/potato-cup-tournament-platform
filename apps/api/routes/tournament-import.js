// Import a finished single-elimination event (JSON export of another
// instance): players, seeds and the bracket, rebuilt in lib/import-bracket.js.

import { requireAdmin } from '../lib/admin.js';
import { inTransaction } from '../lib/transaction.js';
import { reconstructImportedMatches } from '../lib/import-bracket.js';

export default async function tournamentImportRoutes(fastify) {
  fastify.post('/tournaments/:id/import', async (req) => {
    requireAdmin(fastify, req);
    const { id } = req.params;
    const { name, description, status, player_capacity, hold_third_place, scheduled_time, created_at, updated_at, players, matches: rawMatches } = req.body;
    if (player_capacity != null && (!Number.isInteger(Number(player_capacity)) || Number(player_capacity) < 2 || Number(player_capacity) > 128)) {
      throw fastify.httpErrors.badRequest('player_capacity must be between 2 and 128');
    }

    await inTransaction(fastify.db, async (client) => {
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

      // 4. Matches, rebuilt top-down from the final
      const reconstructedMatches = reconstructImportedMatches(rawMatches || []);
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
    });

    // Trigger real-time broadcast
    fastify.tournamentEvents.emit(`update:${id}`, { type: 'imported' });

    return { success: true };
  });
}
