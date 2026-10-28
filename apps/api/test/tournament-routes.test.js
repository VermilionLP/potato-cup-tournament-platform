import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconstructImportedMatches } from '../lib/import-bracket.js';
import { playersWithLadder, tournamentDetail } from '../lib/tournament-detail.js';

const noLadder = { ratingOf: () => null, cutoff: 0 };

test('imported brackets are rebuilt from the final; missing matches become byes', () => {
  const rows = reconstructImportedMatches([
    { round: 1, player1_id: 'a', player2_id: 'c', winner_id: 'a', status: 'completed', score1: 2, score2: 1 },
    { round: 2, player1_id: 'a', player2_id: 'b', winner_id: 'a', status: 'completed', score1: 2 },
    { round: 0, player1_id: 'b', player2_id: 'd', status: 'pending' },
  ]);
  assert.deepEqual(rows.map((m) => [m.round, m.position, m.player1_id, m.player2_id, m.status]), [
    [1, 1, 'a', 'c', 'completed'],
    [2, 1, 'a', 'b', 'completed'],
    [2, 2, 'c', null, 'completed'], // c had no semi-final: a bye
    [0, 1, 'b', 'd', 'pending'],
  ]);
  assert.equal(rows[1].score2, 0);
  assert.deepEqual(reconstructImportedMatches([]), []);
});

test('players get their division rating, or unrated', () => {
  const ladder = {
    cutoff: Date.parse('2026-01-01'),
    ratingOf: (id) => (id === 'a' ? { mmr: 1600, games: 12, provisional: false, last_game_at: '2026-06-01', tier: { key: 'gold' } } : null),
  };
  const [a, b] = playersWithLadder([{ id: 'a' }, { id: 'b' }], ladder);
  assert.deepEqual([a.ladder_mmr, a.ladder_games, a.ladder_provisional, a.ladder_active, a.ladder_tier.key], [1600, 12, false, true, 'gold']);
  assert.deepEqual([b.ladder_mmr, b.ladder_games, b.ladder_provisional, b.ladder_active, b.ladder_tier.key], [null, 0, true, null, 'unrated']);
});

test('Swiss detail: standings and the automatic round count', () => {
  const t = { id: 't', format: 'swiss', swiss_rounds: null, status: 'in_progress' };
  const players = [{ id: 'a', seed: 1 }, { id: 'b', seed: 2 }, { id: 'c', seed: 3 }, { id: 'd', seed: 4 }];
  const matches = [{ id: 1, bracket: 'sw', round: 1, player1_id: 'a', player2_id: 'c', winner_id: 'a', status: 'completed', score1: 1, score2: 0 }];
  const detail = tournamentDetail(t, { players, matches, votes: [], customVotes: [], ladder: noLadder });
  assert.equal(detail.swiss_rounds_auto, true);
  assert.equal(detail.swiss_rounds_effective, 3); // round robin of 4
  assert.equal(detail.standings[0].player_id, 'a');
  assert.equal(detail.group_stage, undefined);
  assert.deepEqual(detail.custom_votes, []);
  assert.equal(detail.points_awarded, undefined);
});

test('finished events with a points table list the points awarded', () => {
  const t = { id: 't', format: 'single_elim', status: 'completed', points_table: [{ from: 1, to: 1, points: 10 }, { from: 2, to: 2, points: 6 }] };
  const players = [{ id: 'a', seed: 1 }, { id: 'b', seed: 2 }];
  const matches = [{ id: 1, bracket: 'main', round: 1, position: 1, player1_id: 'a', player2_id: 'b', winner_id: 'b', status: 'completed', score1: 0, score2: 2 }];
  const detail = tournamentDetail(t, { players, matches, votes: [], customVotes: [], ladder: noLadder });
  assert.equal(detail.swiss_rounds_effective, undefined);
  assert.deepEqual(detail.points_awarded, { b: 10, a: 6 });
});
