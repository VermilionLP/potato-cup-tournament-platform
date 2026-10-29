// Coalesced refresh for live (SSE) updates: a burst of messages, e.g.
// several referees reporting results at once, becomes one reload after
// `delay` ms of quiet (at most `maxWait` ms after the first message).
// Only one reload runs at a time; messages arriving during a reload
// schedule one more afterwards, so the last state is always fetched.

export function coalescedRefresh(run, { delay = 300, maxWait = 1500 } = {}) {
  let timer = null;
  let firstAt = 0;
  let running = false;
  let again = false;
  let stopped = false;

  async function fire() {
    timer = null;
    firstAt = 0;
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await run();
    } catch (e) {
      console.error('live refresh failed', e);
    } finally {
      running = false;
    }
    if (again && !stopped) {
      again = false;
      schedule();
    }
  }

  function schedule() {
    if (stopped) return;
    const now = Date.now();
    if (!firstAt) firstAt = now;
    if (timer) clearTimeout(timer);
    const wait = Math.max(0, Math.min(delay, firstAt + maxWait - now));
    timer = setTimeout(fire, wait);
  }

  schedule.stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return schedule;
}
