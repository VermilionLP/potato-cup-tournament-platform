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
//
// @ only goes to QQ numbers that are in the group (the member list, read
// every MEMBERS_TTL_MS): NapCat refuses a whole message (retcode 1200) that
// @s someone who is not, and a player's profile can carry a wrong or old QQ
// number. If a message with @s still fails, it is sent once more without
// them (the names are in the text anyway).
//
// An event's final placings (kind 'final') also carry a results picture,
// drawn here from the notice's data (cards.final); text only if drawing
// fails or there is no renderer.

export const POLL_MS = 5_000;
export const MAX_TRIES = 3;
export const SEND_TIMEOUT_MS = 20_000;
export const MEMBERS_TTL_MS = 10 * 60 * 1000;

/**
 * The group's member QQ numbers (a Set), from the bot; cached in `cache`
 * for MEMBERS_TTL_MS. null when the list cannot be read (then nobody is
 * filtered out).
 */
export async function groupMembers(bot, groupId, cache = {}, now = Date.now()) {
  if (cache.set && now - cache.at < MEMBERS_TTL_MS) return cache.set;
  try {
    const res = await bot.getGuildMemberList(String(groupId));
    const set = new Set((res?.data || []).map((m) => String(m.user?.id ?? m.userId ?? '')).filter(Boolean));
    if (!set.size) return cache.set || null;
    Object.assign(cache, { set, at: now });
    return set;
  } catch {
    return cache.set || null;
  }
}

/** Milliseconds to wait after a message: a few seconds, not always the same. */
export function pauseMs(random = Math.random) {
  return 3000 + Math.floor(random() * 4000);
}

/**
 * The message: one @ per QQ number (only group members when `members` is a
 * Set), then the text. `h` is Koishi's element builder.
 */
export function noticeMessage(h, notice, members = null, image = null) {
  const parts = [];
  for (const qq of notice.mentions || []) {
    if (members && !members.has(String(qq))) continue;
    parts.push(h.at(String(qq)), ' ');
  }
  if (parts.length) parts.push('\n');
  parts.push(notice.text);
  if (image) parts.push(h.image(image, 'image/png'));
  return parts;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Errors from the adapter repeat the whole request; the gist is enough.
const short = (err) => String(err?.message || err).replace(/args: \{.*\}, /, '').slice(0, 160);

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
  memberCache = {}, cards = null,
}) {
  const bot = getBot();
  if (!bot) return 0;
  const notices = await site.notices();
  if (!notices.length) return 0;
  const members = typeof bot.getGuildMemberList === 'function' ? await groupMembers(bot, groupId, memberCache) : null;
  let posted = 0;
  const send = (msg) => withTimeout(bot.sendMessage(String(groupId), msg), timeoutMs, `no answer in ${timeoutMs / 1000} s`);
  for (const notice of notices) {
    const ids = idsOf(notice);
    const key = ids.join(',');
    const outside = members ? (notice.mentions || []).filter((qq) => !members.has(String(qq))) : [];
    if (outside.length) logger.warn?.(`[notices] #${key}: not @-ing ${outside.join(', ')} (not in the group)`);
    let image = null;
    if (notice.kind === 'final' && notice.data?.rows?.length && cards) {
      try {
        image = await cards.final(notice.data, new Date());
      } catch (err) {
        logger.warn?.(`[notices] #${key}: drawing the results picture failed, text only: ${short(err)}`);
      }
    }
    try {
      const message = noticeMessage(h, notice, members, image);
      try {
        await send(message);
      } catch (err) {
        // A message with @s that fails: once more without them.
        if (!(notice.mentions || []).some((qq) => !members || members.has(String(qq)))) throw err;
        logger.warn?.(`[notices] #${key} with @ failed (${short(err)}), sending without @`);
        await send(noticeMessage(h, { ...notice, mentions: [] }, null, image));
      }
    } catch (err) {
      const tries = (failures.get(key) || 0) + 1;
      failures.set(key, tries);
      if (tries < MAX_TRIES) {
        logger.warn?.(`[notices] posting #${key} failed (${tries}/${MAX_TRIES}): ${short(err)}`);
        break; // try again next round
      }
      // Given up: mark it so the rest are not held up behind it.
      logger.warn?.(`[notices] giving up on #${key} after ${tries} tries: ${short(err)}`);
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
  const memberCache = {};
  const round = async () => {
    let posted = 0;
    try {
      posted = await deliverOnce({ ...options, failures, memberCache });
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
