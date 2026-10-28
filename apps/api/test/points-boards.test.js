import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeBoards } from '../routes/points.js';

const table = [{ from: 1, to: 1, points: 10 }, { from: 2, to: 2, points: 6 }];
const event = (id, pool, winner, loser, day) => ({
  id, name: id, status: 'completed', format: 'single_elim', vehicle_pool: pool, points_table: table,
  points_season: '2026', points_kind: 'weekly', points_invite: false, played_at: `2026-0${day}-01T12:00:00Z`,
  match: { id: day, tournament_id: id, bracket: 'main', round: 1, position: 1, player1_id: winner, player2_id: loser, winner_id: winner, status: 'completed', score1: 2, score2: 0 },
});

test('Top Jet events count towards the Legacy Jet points board', async () => {
  const events = [event('w20', 'top-jet', 'a', 'b', 5), event('w23', 'legacy-jet', 'b', 'a', 6), event('w21', 'prop', 'c', 'd', 5)];
  const db = {
    async query(sql, params) {
      const ids = params?.[0] || [];
      if (sql.includes('FROM axsuck.matches')) return { rows: events.filter((e) => ids.includes(e.id)).map((e) => e.match) };
      if (sql.includes('FROM axsuck.tournament_players')) {
        return { rows: events.filter((e) => ids.includes(e.id)).flatMap((e) => [e.match.player1_id, e.match.player2_id].map((p, i) => ({ tournament_id: e.id, player_id: p, seed: i + 1 }))) };
      }
      if (sql.includes('FROM axsuck.players')) return { rows: [] };
      throw new Error(sql);
    },
  };
  const boards = await computeBoards(db, '2026', events);
  assert.deepEqual(boards.map((b) => b.pool), ['prop', 'legacy-jet']);
  const jet = boards.find((b) => b.pool === 'legacy-jet');
  assert.deepEqual(jet.events.map((e) => e.id), ['w20', 'w23']);
  assert.equal(jet.players.reduce((s, p) => s + Object.keys(p.points).length, 0), 4, 'both events scored');
});
