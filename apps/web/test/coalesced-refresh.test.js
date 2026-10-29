import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coalescedRefresh } from '../src/lib/coalesced-refresh.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a burst of messages becomes one reload', async () => {
  let runs = 0;
  const refresh = coalescedRefresh(async () => { runs++; }, { delay: 20, maxWait: 200 });
  for (let i = 0; i < 5; i++) { refresh(); await sleep(5); }
  await sleep(50);
  assert.equal(runs, 1);
  refresh.stop();
});

test('maxWait caps how long a steady stream delays the reload', async () => {
  let runs = 0;
  const refresh = coalescedRefresh(async () => { runs++; }, { delay: 30, maxWait: 60 });
  const end = Date.now() + 100;
  while (Date.now() < end) { refresh(); await sleep(10); }
  assert.ok(runs >= 1);
  refresh.stop();
});

test('a message during a reload schedules one more, never two at once', async () => {
  let runs = 0;
  let running = 0;
  let overlap = false;
  const refresh = coalescedRefresh(async () => {
    running++;
    if (running > 1) overlap = true;
    runs++;
    await sleep(40);
    running--;
  }, { delay: 5, maxWait: 5 });
  refresh();
  await sleep(15); // first reload in flight
  refresh();
  refresh();
  await sleep(120);
  assert.equal(overlap, false);
  assert.equal(runs, 2);
  refresh.stop();
});

test('stop cancels a pending reload', async () => {
  let runs = 0;
  const refresh = coalescedRefresh(async () => { runs++; }, { delay: 10 });
  refresh();
  refresh.stop();
  await sleep(30);
  assert.equal(runs, 0);
});

test('a failed reload does not stop later ones', async () => {
  let runs = 0;
  const orig = console.error;
  console.error = () => {};
  const refresh = coalescedRefresh(async () => { runs++; throw new Error('x'); }, { delay: 5, maxWait: 5 });
  refresh();
  await sleep(20);
  refresh();
  await sleep(20);
  console.error = orig;
  assert.equal(runs, 2);
  refresh.stop();
});
