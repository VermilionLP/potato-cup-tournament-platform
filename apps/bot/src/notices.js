// The community bot posts the site's notices in the QQ group: it asks the
// site for unsent notices every few seconds, sends each one with an @ for
// every QQ number in it, one at a time with a pause in between (bursts are
// what QQ's risk checks look for), and tells the site it was sent. A notice
// that fails stays unsent and is tried again on the next round; the site
// drops it after 30 minutes.

export const POLL_MS = 10_000;

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

/**
 * Runs one round: fetch, post, mark sent. `getBot()` returns the online
 * OneBot bot or null. Returns how many were posted.
 */
export async function deliverOnce({ site, getBot, groupId, h, logger = console, pause = sleep, random = Math.random }) {
  const bot = getBot();
  if (!bot) return 0;
  const notices = await site.notices();
  let posted = 0;
  for (const notice of notices) {
    try {
      await bot.sendMessage(String(groupId), noticeMessage(h, notice));
    } catch (err) {
      logger.warn?.(`[notices] posting #${notice.id} failed: ${err?.message || err}`);
      break; // try the rest next round, in order
    }
    posted += 1;
    try {
      await site.markSent(notice.id);
    } catch (err) {
      // Posted but not marked: it would be posted again, so stop and retry the mark later.
      logger.warn?.(`[notices] marking #${notice.id} sent failed: ${err?.message || err}`);
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
  const round = async () => {
    try {
      await deliverOnce(options);
    } catch (err) {
      options.logger?.warn?.(`[notices] ${err?.message || err}`);
    }
    if (!stopped) timer = setTimeout(round, POLL_MS);
  };
  timer = setTimeout(round, POLL_MS);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
