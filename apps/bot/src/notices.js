// The community bot posts the site's notices in the QQ group: it asks the
// site for unsent messages (the site puts urgent ones first, drops ones
// overtaken by events and merges ready / result notices of one event:
// apps/api/lib/bot-notices.js), sends each with an @ for every QQ number in
// it, one at a time with a pause in between (bursts are what QQ's risk
// checks look for), and tells the site it was sent. While there is a queue
// it keeps going; when it is empty it asks again every POLL_MS. A message
// that fails is tried again next round; one that fails MAX_TRIES times is
// given up so it does not hold up the rest. The site drops notices after
// 30 minutes.

export const POLL_MS = 5_000;
export const MAX_TRIES = 3;
export const SEND_TIMEOUT_MS = 20_000;

/** Milliseconds to wait after a message: a few seconds, not always the same. */
export function pauseMs(random = Math.random) {
  return 3000 + Math.floor(random() * 4000);
}

/** The message: one @ per QQ number, then the text. `h` is Koishi's element builder. */
export function noticeMessage(h, notice) {
  const parts = [];
  for (const qq of notice.mentions || []) parts.push(h.at(String(qq)), ' ');
  if (parts.length) parts.push('\n');
  parts.push(notice.text);
  return parts;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const idsOf = (notice) => (Array.isArray(notice.ids) && notice.ids.length ? notice.ids : [notice.id]);

/** `promise`, or a rejection after `ms` (a stuck send must not stop the queue). */
export function withTimeout(promise, ms, what = 'timed out') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(what)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Runs one round: fetch, post, mark sent. `getBot()` returns the online
 * OneBot bot or null. `failures` (a Map kept between rounds) counts failed
 * tries per message. Returns how many were posted.
 */
export async function deliverOnce({
  site, getBot, groupId, h, logger = console, pause = sleep, random = Math.random, failures = new Map(), timeoutMs = SEND_TIMEOUT_MS,
}) {
  const bot = getBot();
  if (!bot) return 0;
  const notices = await site.notices();
  let posted = 0;
  for (const notice of notices) {
    const ids = idsOf(notice);
    const key = ids.join(',');
    try {
      await withTimeout(bot.sendMessage(String(groupId), noticeMessage(h, notice)), timeoutMs, `no answer in ${timeoutMs / 1000} s`);
    } catch (err) {
      const tries = (failures.get(key) || 0) + 1;
      failures.set(key, tries);
      if (tries < MAX_TRIES) {
        logger.warn?.(`[notices] posting #${key} failed (${tries}/${MAX_TRIES}): ${err?.message || err}`);
        break; // try again next round
      }
      // Given up: mark it so the rest are not held up behind it.
      logger.warn?.(`[notices] giving up on #${key} after ${tries} tries: ${err?.message || err}`);
      failures.delete(key);
      try {
        await site.markSent(ids);
      } catch {
        break;
      }
      continue;
    }
    failures.delete(key);
    posted += 1;
    try {
      await site.markSent(ids);
    } catch (err) {
      // Posted but not marked: it would be posted again, so stop and retry the mark later.
      logger.warn?.(`[notices] marking #${key} sent failed: ${err?.message || err}`);
      break;
    }
    await pause(pauseMs(random));
  }
  return posted;
}

/** Starts the loop; returns a function that stops it. */
export function startNoticeLoop(options) {
  let stopped = false;
  let timer = null;
  const failures = new Map();
  const round = async () => {
    let posted = 0;
    try {
      posted = await deliverOnce({ ...options, failures });
    } catch (err) {
      options.logger?.warn?.(`[notices] ${err?.message || err}`);
    }
    // A queue: keep going (the pause after each message already spaces them).
    if (!stopped) timer = setTimeout(round, posted ? 0 : POLL_MS);
  };
  timer = setTimeout(round, POLL_MS);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
