import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeRanking, revealAt, revealedCount, publicView, changeProblem, revealsToAnnounce, REVEAL_EVERY_MS, TOP_SIZE } from '../lib/season-top.js';

const DAY = REVEAL_EVERY_MS;
const start = Date.UTC(2026, 11, 1, 12);
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

test('normalizeRanking trims, drops repeats and caps at TOP_SIZE', () => {
  assert.deepEqual(normalizeRanking([' a ', 'b', 'a', '', null]), ['a', 'b']);
  assert.equal(normalizeRanking(ids(30)).length, TOP_SIZE);
});

test('one place a day from the last up', () => {
  assert.equal(revealAt(start, 20, 20), start);
  assert.equal(revealAt(start, 1, 20), start + 19 * DAY);
  assert.equal(revealedCount(start, 20, start - 1), 0);
  assert.equal(revealedCount(start, 20, start), 1);
  assert.equal(revealedCount(start, 20, start + 2 * DAY + 5), 3);
  assert.equal(revealedCount(start, 20, start + 40 * DAY), 20);
});

test('publicView hides unrevealed players', () => {
  const row = { ranking: ids(20), start_at: new Date(start).toISOString() };
  const v = publicView(row, start + DAY);
  assert.deepEqual(v.revealed.map((r) => [r.rank, r.id]), [[20, 'p20'], [19, 'p19']]);
  assert.equal(v.next.rank, 18);
  assert.equal(v.started, true);
  assert.equal(v.done, false);
  assert.ok(!JSON.stringify(v).includes('"p1"'));
  assert.equal(publicView(row, start + 19 * DAY).done, true);
  assert.equal(publicView(row, start + 19 * DAY).next, null);
  assert.equal(publicView({ ranking: ids(5) }, start).started, false);
});

test('changeProblem locks revealed places, the size and the start', () => {
  const before = { ranking: ids(20), start_at: new Date(start).toISOString() };
  assert.equal(changeProblem(before, { ranking: [] }, start - 1), '至少要有 1 名选手');
  assert.equal(changeProblem(before, { ranking: ids(10), start_at: start + DAY }, start - 1), '');
  const now = start + DAY; // places 20 and 19 are out
  assert.equal(changeProblem(before, { ranking: ids(19) }, now), '揭晓开始后不能改变人数');
  assert.equal(changeProblem(before, { ranking: ids(20), start_at: start + DAY }, now), '揭晓开始后不能修改开始时间');
  const swapped = ids(20);
  [swapped[18], swapped[17]] = [swapped[17], swapped[18]];
  assert.match(changeProblem(before, { ranking: swapped }, now), /第 19 名/);
  const top = ids(20);
  [top[0], top[1]] = [top[1], top[0]];
  assert.equal(changeProblem(before, { ranking: top }, now), '');
});

test('revealsToAnnounce: new places only, not ones long past', () => {
  const row = { ranking: ids(20), start_at: new Date(start).toISOString(), announced: 0 };
  assert.deepEqual(revealsToAnnounce(row, start + 1), { ranks: [20], announced: 1 });
  assert.deepEqual(revealsToAnnounce({ ...row, announced: 1 }, start + DAY), { ranks: [19], announced: 2 });
  // Started 5 days ago and never announced: only the reveals of the last 36 h.
  assert.deepEqual(revealsToAnnounce(row, start + 4 * DAY + 60_000), { ranks: [17, 16], announced: 5 });
  assert.deepEqual(revealsToAnnounce({ ...row, announced: 5 }, start + 4 * DAY + 60_000), { ranks: [], announced: 5 });
});
