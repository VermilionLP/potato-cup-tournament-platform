// The web push (VAPID) keys. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env
// win; otherwise the pair the server generated before (app_secrets,
// migration 046); otherwise, when asked to (a browser wants to subscribe),
// a new pair is generated and kept. Keys must never change afterwards:
// every subscription is tied to them.
//
// Once there are keys, the push transport (lib/push-sender.js) is set.

import { setPushTransport } from './push-sender.js';

// web-push is loaded when needed, so the routes load without it (tests).
const webpush = async () => (await import('web-push')).default;

const SECRET_KEY = 'vapid';
const FALLBACK_SUBJECT = 'mailto:potato-cup@example.com';

let current = null;

/** The subject for new keys: the site's https address, else a mailto. */
export function subjectFor(origin) {
  return /^https:\/\/[^/\s]+$/i.test(String(origin || '')) ? origin : FALLBACK_SUBJECT;
}

async function install(keys) {
  const wp = await webpush();
  wp.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  setPushTransport((subscription, payload) => wp.sendNotification(subscription, payload));
  current = keys;
  return keys;
}

/**
 * { publicKey, privateKey, subject, source } or null. `create`: make and
 * keep a pair when there is none (`origin` becomes its subject).
 */
export async function pushKeys(db, { create = false, origin = '', env = process.env, generate = null } = {}) {
  if (current) return current;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return install({
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT || FALLBACK_SUBJECT,
      source: 'env',
    });
  }
  const read = async () => (await db.query('SELECT value FROM axsuck.app_secrets WHERE key = $1', [SECRET_KEY])).rows[0]?.value;
  let stored = await read();
  if (!stored && create) {
    const pair = generate ? generate() : (await webpush()).generateVAPIDKeys();
    // Two servers asking at once keep the same pair: the first insert wins.
    await db.query(
      'INSERT INTO axsuck.app_secrets (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [SECRET_KEY, JSON.stringify({ publicKey: pair.publicKey, privateKey: pair.privateKey, subject: subjectFor(origin) })],
    );
    stored = await read();
  }
  if (!stored?.publicKey || !stored?.privateKey) return null;
  return install({
    publicKey: stored.publicKey,
    privateKey: stored.privateKey,
    subject: env.VAPID_SUBJECT || stored.subject || FALLBACK_SUBJECT,
    source: 'generated',
  });
}

/** For tests: forget the loaded keys. */
export function resetPushKeys() {
  current = null;
  setPushTransport(null);
}
