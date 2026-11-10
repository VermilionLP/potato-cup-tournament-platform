// The QQ bots (apps/bot) call the API with the BOT_TOKEN from .env in the
// x-bot-token header. The token only opens the /bot routes (notices,
// bindings, a player's schedule); it is not an admin token. An admin token
// opens them too. Without BOT_TOKEN the bot routes answer 503 and no
// notices are queued.

import { timingSafeEqual } from 'crypto';
import { isAdminRequest } from './admin.js';

export const BOT_TOKEN_HEADER = 'x-bot-token';

function configuredToken() {
  return (process.env.BOT_TOKEN || '').trim();
}

export function isBotConfigured() {
  return configuredToken().length > 0;
}

export function isBotRequest(req) {
  const expected = configuredToken();
  if (!expected) return false;
  const header = req?.headers?.[BOT_TOKEN_HEADER];
  const raw = String((Array.isArray(header) ? header[0] : header) || '').trim();
  if (!raw) return false;
  const a = Buffer.from(raw, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Throws unless the request comes from the bot (or an admin). */
export function requireBot(fastify, req) {
  if (isAdminRequest(req) || isBotRequest(req)) return;
  if (!isBotConfigured()) {
    throw fastify.httpErrors.serviceUnavailable('The QQ bots are off: BOT_TOKEN is not configured on the server.');
  }
  throw fastify.httpErrors.unauthorized('Bot token required.');
}
