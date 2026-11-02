import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canConfirm, canDispute, isDueForAutoConfirm, playerReport, REPORT_CONFIRM_MS, reportToApply, scoreProblem } from '../lib/match-reports.js';
import { checkinState, CHECKIN_LEAD_MS, scheduledStart } from '../lib/checkin.js';

const match = (pending_report = null) => ({ id: 1, player1_id: 'a', player2_id: 'b', status: 'pending', pending_report });
const now = new Date('2026-11-02T12:00:00Z');

test('a first report is stored; reporting again replaces your own', () => {
  const first = playerReport(match(), 'a', { kind: 'score', score1: 2, score2: 1 }, now);
  assert.equal(first.action, 'store');
  assert.deepEqual(first.pending, { kind: 'score', score1: 2, score2: 1, by: 'a', at: now.toISOString(), disputed: false, counter: null });
  const again = playerReport(match(first.pending), 'a', { kind: 'score', score1: 2, score2: 0 }, now);
  assert.equal(again.action, 'store');
  assert.equal(again.pending.score2, 0);
});

test("the opponent's same score confirms it, a different one disputes it", () => {
  const stored = playerReport(match(), 'a', { kind: 'score', score1: 2, score2: 1 }, now).pending;
  const same = playerReport(match(stored), 'b', { kind: 'score', score1: '2', score2: '1' }, now);
  assert.equal(same.action, 'confirm');
  assert.equal(same.pending, stored);
  const other = playerReport(match(stored), 'b', { kind: 'score', score1: 1, score2: 2 }, now);
  assert.equal(other.action, 'dispute');
  assert.equal(other.pending.disputed, true);
  assert.deepEqual(other.pending.counter, { kind: 'score', score1: 1, score2: 2, by: 'b', at: now.toISOString() });
  assert.equal(other.pending.score1, 2, 'the original report is kept');
  const claim = playerReport(match(stored), 'b', { kind: 'walkover', winner_id: 'b' }, now);
  assert.equal(claim.action, 'dispute');
});

test('who may confirm or dispute', () => {
  const score = { kind: 'score', by: 'a', score1: 2, score2: 0, at: now.toISOString(), disputed: false };
  assert.equal(canConfirm(match(score), 'b'), true);
  assert.equal(canConfirm(match(score), 'a'), false, 'not your own');
  assert.equal(canConfirm(match(score), 'c'), false);
  assert.equal(canConfirm(match({ ...score, disputed: true }), 'b'), false, 'a dispute goes to an admin');
  assert.equal(canConfirm(match({ ...score, kind: 'walkover', winner_id: 'a' }), 'b'), false, 'walkover claims need an admin');
  assert.equal(canDispute(match(score), 'b'), true);
  assert.equal(canDispute(match(score), 'a'), false);
});

test('undisputed scores take effect after the confirmation window', () => {
  const at = now.getTime();
  const score = { kind: 'score', at: now.toISOString(), disputed: false };
  assert.equal(isDueForAutoConfirm(score, at + REPORT_CONFIRM_MS - 1), false);
  assert.equal(isDueForAutoConfirm(score, at + REPORT_CONFIRM_MS), true);
  assert.equal(isDueForAutoConfirm({ ...score, disputed: true }, at + 2 * REPORT_CONFIRM_MS), false);
  assert.equal(isDueForAutoConfirm({ ...score, kind: 'walkover' }, at + 2 * REPORT_CONFIRM_MS), false);
  assert.equal(isDueForAutoConfirm(null), false);
});

test('admins apply the report or the counter-report', () => {
  const r = { kind: 'score', score1: 2, score2: 0, counter: { kind: 'score', score1: 0, score2: 2 } };
  assert.equal(reportToApply(r).score1, 2);
  assert.equal(reportToApply(r, 'counter').score2, 2);
  assert.equal(reportToApply({ ...r, counter: null }, 'counter').score1, 2);
});

test('scores must be whole, non-negative and not a draw', () => {
  assert.equal(scoreProblem(2, 1), null);
  assert.ok(scoreProblem(1, 1));
  assert.ok(scoreProblem(-1, 2));
  assert.ok(scoreProblem(1.5, 0));
});

test('check-in opens 30 minutes before the start (Beijing time) and needs the switch', () => {
  const t = { checkin_enabled: true, status: 'registration', scheduled_time: '2026-11-02T20:00' };
  const start = scheduledStart(t.scheduled_time);
  assert.equal(new Date(start).toISOString(), '2026-11-02T12:00:00.000Z');
  assert.equal(checkinState(t, start - CHECKIN_LEAD_MS - 1).open, false);
  assert.equal(checkinState(t, start - CHECKIN_LEAD_MS).open, true);
  assert.equal(checkinState(t, start + 3600_000).open, true, 'open until the admin starts it');
  assert.equal(checkinState({ ...t, checkin_enabled: false }, start).open, false);
  assert.equal(checkinState({ ...t, status: 'in_progress' }, start).open, false);
  assert.equal(checkinState({ ...t, scheduled_time: '' }, 0).open, true, 'no time: open during registration');
  assert.equal(checkinState(t, 0).opens_at, '2026-11-02T11:30:00.000Z');
});
