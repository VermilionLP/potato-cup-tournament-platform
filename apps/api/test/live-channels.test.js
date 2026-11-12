import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdownEnd, gameView, liveChannelsView, parseChannel } from '../lib/live-channels.js';
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
  const detail = tournamentDetail(t, { players: [], matches: [], votes: [], ladder: noLadder, channels });
  // Channel 1 has no row: an empty one, not the old tournaments columns.
  assert.deepEqual(detail.live_channels.map((c) => [c.channel, c.active_match_id, c.overlay_scene]), [[1, null, 'auto'], [2, 7, 'ingame']]);
  assert.equal(detail.active_match_id, null);
  assert.equal(detail.overlay_scene, 'auto');

  const withMain = tournamentDetail(t, {
    players: [], matches: [], votes: [], ladder: noLadder,
    channels: [{ channel: 1, active_match_id: 5, overlay_scene: 'hybrid', overlay_round: 3, overlay_stage: 'wb:3' }, ...channels],
  });
  assert.deepEqual([withMain.active_match_id, withMain.overlay_scene, withMain.overlay_round, withMain.overlay_stage], [5, 'hybrid', 3, 'wb:3']);
  assert.deepEqual(liveChannelsView([]), [{ channel: 1, active_match_id: null, overlay_scene: 'auto', overlay_round: null, overlay_stage: null, countdown_end: null, overlay_set_at: null, game: null }]);
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
      if (text.startsWith('INSERT INTO axsuck.live_channels (tournament_id, channel, countdown_end)')) {
        const [tid, channel, end] = params;
        const row = rows.find((r) => r.tournament_id === tid && r.channel === channel);
        if (row) row.countdown_end = end;
        else rows.push({ tournament_id: tid, channel, active_match_id: null, overlay_scene: 'auto', overlay_round: null, overlay_stage: null, countdown_end: end });
        return { rowCount: 1, rows: [] };
      }
      if (text.startsWith('INSERT INTO axsuck.live_channels (tournament_id, channel, game_state')) {
        const [tid, channel, state, changed] = params;
        let row = rows.find((r) => r.tournament_id === tid && r.channel === channel);
        if (!row) {
          rows.push({ tournament_id: tid, channel, active_match_id: null, overlay_scene: 'auto', game_state: state, game_match_id: null, game_changed_at: 'now', game_seen_at: 'now' });
          return { rowCount: 1, rows: [] };
        }
        if (changed) {
          row.game_match_id = state === 'ended' ? row.game_match_id ?? row.active_match_id : row.active_match_id;
          row.game_changed_at = `changed:${state}`;
        }
        Object.assign(row, { game_state: state, game_seen_at: `seen:${state}` });
        return { rowCount: 1, rows: [] };
      }
      if (text.startsWith('INSERT INTO axsuck.live_channels (tournament_id, channel, autoscene_paused)')) {
        const [tid, channel, paused] = params;
        const row = rows.find((r) => r.tournament_id === tid && r.channel === channel);
        if (row) row.autoscene_paused = paused;
        else rows.push({ tournament_id: tid, channel, active_match_id: null, overlay_scene: 'auto', autoscene_paused: paused });
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
  assert.deepEqual(await repo.get('t', 5), { channel: 5, active_match_id: null, overlay_scene: 'auto', overlay_round: null, overlay_stage: null, countdown_end: null, overlay_set_at: null, game: null });
});

test('match start countdown: seconds or an end time, within 24 hours; per channel', async () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  assert.equal(countdownEnd({ seconds: 300 }, now).toISOString(), '2026-11-10T12:05:00.000Z');
  assert.equal(countdownEnd({ end: '2026-11-10T13:00:00Z' }, now).toISOString(), '2026-11-10T13:00:00.000Z');
  assert.equal(countdownEnd({ clear: true }, now), null);
  assert.equal(countdownEnd({ seconds: null }, now), null);
  for (const bad of [{}, { seconds: 0 }, { seconds: -5 }, { seconds: 'x' }, { seconds: 90000 }, { end: 'soon' }, { end: '2026-11-10T11:00:00Z' }]) {
    assert.equal(countdownEnd(bad, now), undefined, JSON.stringify(bad));
  }

  const repo = LiveChannelRepo(fakeDb());
  const end = new Date(now + 60_000);
  assert.equal((await repo.setCountdown('t', 2, end)).countdown_end, end);
  assert.equal((await repo.get('t', 1)).countdown_end, null, 'channel 1 untouched');
  assert.equal((await repo.setCountdown('t', 2, null)).countdown_end, null);
});

test('the auto-scene script: game state per channel, the match it was about, pause', async () => {
  assert.equal(gameView({}), null, 'no script ever reported');
  assert.deepEqual(gameView({ autoscene_paused: true }), { state: null, match_id: null, changed_at: null, seen_at: null, paused: true });

  const db = fakeDb({ live: [{ channel: 1, active_match_id: 1 }] });
  const repo = LiveChannelRepo(db);
  let r = await repo.reportGame('t', 1, 'hangar');
  assert.equal(r.changed, true);
  r = await repo.reportGame('t', 1, 'battle');
  assert.deepEqual([r.changed, r.channel.game.state, r.channel.game.match_id], [true, 'battle', 1]);
  // The battle ends after the console moved on to the next match: still about match 1.
  await repo.setActiveMatch('t', 1, 2);
  r = await repo.reportGame('t', 1, 'ended');
  assert.deepEqual([r.changed, r.channel.game.match_id], [true, 1]);
  // A heartbeat: no change, the change time stays.
  const changedAt = r.channel.game.changed_at;
  r = await repo.reportGame('t', 1, 'ended');
  assert.deepEqual([r.changed, r.channel.game.changed_at], [false, changedAt]);
  assert.equal((await repo.get('t', 2)).game, null, 'channel 2 untouched');

  assert.equal((await repo.setPaused('t', 1, true)).game.paused, true);
  assert.equal((await repo.setPaused('t', 1, false)).game.paused, false);
});
