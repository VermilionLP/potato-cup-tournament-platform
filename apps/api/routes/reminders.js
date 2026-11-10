// In-page reminders: what needs the player now (lib/attention.js). The
// site polls this while a page is open, so it reads only the player's own
// registrations and pending matches.

import { attentionItems } from '../lib/attention.js';
import { getPlayerDisplayName } from '../repositories/player-repo.js';

export default async function reminderRoutes(fastify) {
  fastify.get('/reminders/:playerId', async (req, reply) => {
    const playerId = String(req.params.playerId || '').slice(0, 100);
    const events = (await fastify.db.query(`
      SELECT t.id, t.name, t.status, t.scheduled_time, t.checkin_enabled, tp.checked_in_at, tp.forfeited
      FROM axsuck.tournament_players tp
      JOIN axsuck.tournaments t ON t.id = tp.tournament_id
      WHERE tp.player_id = $1 AND t.status <> 'completed'
    `, [playerId])).rows;
    const running = events.filter((e) => e.status === 'in_progress').map((e) => e.id);
    const matches = running.length ? (await fastify.db.query(`
      SELECT id, tournament_id, player1_id, player2_id, status, pending_report, banpick
      FROM axsuck.matches
      WHERE tournament_id = ANY($2::text[]) AND status = 'pending'
        AND (player1_id = $1 OR player2_id = $1)
        AND player1_id IS NOT NULL AND player2_id IS NOT NULL
    `, [playerId, running])).rows : [];
    const others = [...new Set(matches.flatMap((m) => [m.player1_id, m.player2_id]).filter((id) => id !== playerId))];
    const names = new Map(others.length ? (await fastify.db.query(
      'SELECT id, battle_tags FROM axsuck.players WHERE id = ANY($1::text[])', [others],
    )).rows.map((p) => [p.id, getPlayerDisplayName(p) || p.id]) : []);
    reply.header('Cache-Control', 'no-store');
    return { items: attentionItems(playerId, { events, matches, names }) };
  });
}
