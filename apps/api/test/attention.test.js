import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attentionItems } from '../lib/attention.js';

const NOW = Date.parse('2026-11-20T11:40:00Z'); // 19:40 Beijing
const event = (over = {}) => ({ id: 'e1', name: 'Cup', status: 'in_progress', scheduled_time: '2026-11-20 20:00', checkin_enabled: false, checked_in_at: null, forfeited: false, ...over });
const match = (over = {}) => ({ id: 7, tournament_id: 'e1', player1_id: 'me', player2_id: 'op', status: 'pending', pending_report: null, banpick: null, ...over });
const names = new Map([['op', 'Opponent']]);

test('a playable match is "ready", with the opponent named', () => {
  const [item] = attentionItems('me', { events: [event()], matches: [match()], names }, NOW);
  assert.equal(item.kind, 'ready');
  assert.equal(item.opponent, 'Opponent');
  assert.equal(item.key, 'ready:7:me:op');
});

test('my ban turn, and not the opponent\'s', () => {
  const banpick = { state: { phase: 'ban', bans: [] } };
  assert.equal(attentionItems('me', { events: [event()], matches: [match({ banpick })] }, NOW)[0].kind, 'ban');
  assert.equal(attentionItems('op', { events: [event()], matches: [match({ banpick })] }, NOW)[0].kind, 'ready');
  const after = { state: { phase: 'ban', bans: [{ by: 'A', group: 'X' }] } };
  assert.equal(attentionItems('op', { events: [event()], matches: [match({ banpick: after })] }, NOW)[0].key, 'ban:7:1');
});

test("the opponent's score waits for my confirmation, seen from my side", () => {
  const pending_report = { kind: 'score', by: 'op', score1: 1, score2: 3, at: '2026-11-20T11:35:00Z', disputed: false };
  const [item] = attentionItems('me', { events: [event()], matches: [match({ pending_report })] }, NOW);
  assert.equal(item.kind, 'confirm');
  assert.deepEqual(item.score, [1, 3]);
  assert.equal(item.deadline, '2026-11-20T11:45:00.000Z');
  // My own report: nothing for me to do.
  assert.deepEqual(attentionItems('op', { events: [event()], matches: [match({ pending_report })] }, NOW), []);
});

test('starting soon, check-in open, and nothing once checked in', () => {
  assert.equal(attentionItems('me', { events: [event({ status: 'registration' })] }, NOW)[0].kind, 'soon');
  assert.deepEqual(attentionItems('me', { events: [event({ status: 'registration' })] }, NOW - 2 * 3600e3), []);
  const checkin = event({ status: 'registration', checkin_enabled: true });
  assert.equal(attentionItems('me', { events: [checkin] }, NOW)[0].kind, 'checkin');
  assert.equal(attentionItems('me', { events: [{ ...checkin, checked_in_at: '2026-11-20T11:35:00Z' }] }, NOW)[0].kind, 'soon');
});

test('most urgent first; forfeited players and finished events get nothing', () => {
  const events = [event(), event({ id: 'e2', status: 'registration' })];
  const pending_report = { kind: 'score', by: 'op', score1: 0, score2: 2, at: '2026-11-20T11:35:00Z', disputed: false };
  const kinds = attentionItems('me', { events, matches: [match({ pending_report })] }, NOW).map((i) => i.kind);
  assert.deepEqual(kinds, ['confirm', 'soon']);
  assert.deepEqual(attentionItems('me', { events: [event({ forfeited: true })], matches: [match()] }, NOW), []);
});
