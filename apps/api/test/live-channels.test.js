import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveChannelsView, parseChannel } from '../lib/live-channels.js';
import { LiveChannelRepo } from '../repositories/live-channel-repo.js';
import { tournamentDetail } from '../lib/tournament-detail.js';

const noLadder = { ratingOf: () => null, cutoff: 0 };

test('channel numbers: 1 by default, 1-9 allowed', () => {
  assert.equal(parseChannel(undefined), 1);
  assert.equal(parseChannel(''), 1);
  assert.equal(parseChannel(3), 3);
  assert.equal(parseChannel('9'), 9);
  for (const bad of [0, 10, 1.5, 'x', -1]) assert.equal(parseChannel(bad), null, String(bad));
});

test('the detail lists every channel; the old fields mirror channel 1', () => {
  const t = { id: 't', format: 'single_elim', status: 'in_progress', active_match_id: 99, overlay_scene: 'intro' };
  const channels = [
    { channel: 2, active_match_id: 7, overlay_scene: 'ingame', overlay_round: 2, overlay_stage: 'main:2' },
  ];
  const detail = tournamentDetail(t, { players: [], matches: [], votes: [], customVotes: [], ladder: noLadder, channels });
  // Channel 1 has no row: an empty one, not the old tournaments columns.
  assert.deepEqual(detail.live_channels.map((c) => [c.channel, c.active_match_id, c.overlay_scene]), [[1, null, 'auto'], [2, 7, 'ingame']]);
  assert.equal(detail.active_match_id, null);
  assert.equal(detail.overlay_scene, 'auto');

  const withMain = tournamentDetail(t, {
    players: [], matches: [], votes: [], customVotes: [], ladder: noLadder,
    channels: [{ channel: 1, active_match_id: 5, overlay_scene: 'hybrid', overlay_round: 3, overlay_stage: 'wb:3' }, ...channels],
  });
  assert.deepEqual([withMain.active_match_id, withMain.overlay_scene, withMain.overlay_round, withMain.overlay_stage], [5, 'hybrid', 3, 'wb:3']);
  assert.deepEqual(liveChannelsView([]), [{ channel: 1, active_match_id: null, overlay_scene: 'auto', overlay_round: null, overlay_stage: null }]);
});

function fakeDb({ matchesOfEvent = [1, 2, 3], live = [] } = {}) {
  const rows = live.map((r) => ({ tournament_id: 't', overlay_scene: 'auto', overlay_round: null, overlay_stage: null, ...r }));
  const db = {
    rows,
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT 1 FROM axsuck.matches')) {
        return { rowCount: matchesOfEvent.includes(params[0]) && params[1] === 't' ? 1 : 0, rows: [] };
      }
      if (text.startsWith('SELECT channel FROM axsuck.live_channels WHERE active_match_id = $1 AND NOT')) {
        const hit = rows.filter((r) => r.active_match_id === params[0] && !(r.tournament_id === params[1] && r.channel === params[2]));
        return { rowCount: hit.length, rows: hit };
      }
      if (text.startsWith('INSERT INTO axsuck.live_channels (tournament_id, channel, active_match_id)')) {
        const [tid, channel, matchId] = params;
        const row = rows.find((r) => r.tournament_id === tid && r.channel === channel);
        if (row) row.active_match_id = matchId;
        else rows.push({ tournament_id: tid, channel, active_match_id: matchId, overlay_scene: 'auto', overlay_round: null, overlay_stage: null });
        return { rowCount: 1, rows: [] };
      }
      if (text.startsWith('INSERT INTO axsuck.live_channels (tournament_id, channel, overlay_scene')) {
        const [tid, channel, scene, round, keepStage, stage] = params;
        let row = rows.find((r) => r.tournament_id === tid && r.channel === channel);
        if (!row) {
          row = { tournament_id: tid, channel, active_match_id: null, overlay_stage: stage };
          rows.push(row);
        } else if (keepStage) row.overlay_stage = stage;
        Object.assign(row, { overlay_scene: scene, overlay_round: round });
        return { rowCount: 1, rows: [] };
      }
      if (text.startsWith('SELECT channel, active_match_id, overlay_scene')) {
        const hit = rows.filter((r) => r.tournament_id === params[0] && (params[1] === undefined || r.channel === params[1]));
        return { rowCount: hit.length, rows: hit };
      }
      throw new Error(`unexpected SQL: ${text}`);
    },
  };
  return db;
}

test('channels keep their own live match; a match is live on one channel only', async () => {
  const db = fakeDb({ live: [{ channel: 1, active_match_id: 1 }] });
  const repo = LiveChannelRepo(db);

  const two = await repo.setActiveMatch('t', 2, 2);
  assert.equal(two.channel.active_match_id, 2);
  assert.equal((await repo.get('t', 1)).active_match_id, 1, 'channel 1 untouched');

  assert.deepEqual(await repo.setActiveMatch('t', 3, 1), { conflict: 1 });
  assert.deepEqual(await repo.setActiveMatch('t', 2, 42), { notFound: true });
  // Picking the channel's own match again is fine; clearing needs no match.
  assert.equal((await repo.setActiveMatch('t', 1, 1)).channel.active_match_id, 1);
  assert.equal((await repo.setActiveMatch('t', 1, null)).channel.active_match_id, null);
  assert.equal((await repo.get('t', 2)).active_match_id, 2);
});

test('overlay scene and stage are per channel; a missing stage keeps the old one', async () => {
  const db = fakeDb();
  const repo = LiveChannelRepo(db);
  await repo.setOverlay('t', 1, 'intro', 2, 'wb:2');
  await repo.setOverlay('t', 2, 'ingame', 1, undefined);
  const one = await repo.setOverlay('t', 1, 'hybrid', 3, undefined);
  assert.deepEqual([one.overlay_scene, one.overlay_round, one.overlay_stage], ['hybrid', 3, 'wb:2']);
  const two = await repo.get('t', 2);
  assert.deepEqual([two.overlay_scene, two.overlay_round, two.overlay_stage], ['ingame', 1, null]);
  assert.deepEqual(await repo.get('t', 5), { channel: 5, active_match_id: null, overlay_scene: 'auto', overlay_round: null, overlay_stage: null });
});
