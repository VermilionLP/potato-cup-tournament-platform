import { timingSafeEqual } from 'crypto';
import { playerKeyMatches, requestPlayerKey, storedKeyHash } from './player-key.js';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

function configuredToken() {
  return (process.env.ADMIN_TOKEN || '').trim();
}

function tokensMatch(provided, expected) {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAdminConfigured() {
  return configuredToken().length > 0;
}

export function isAdminRequest(req) {
  const expected = configuredToken();
  if (!expected) return false;
  const header = req?.headers?.[ADMIN_TOKEN_HEADER];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return false;
  return tokensMatch(String(raw).trim(), expected);
}

function safeDecode(value) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

/** Decoded `x-player-id` of the caller, if any. */
export function getRequesterId(req) {
  const header = req?.headers?.['x-player-id'];
  const raw = Array.isArray(header) ? header[0] : header;
  return safeDecode(raw);
}

function audit(fastify, req, action, level) {
  fastify.esLogger?.audit?.({
    level,
    action,
    method: req.method,
    path: req.url,
    route: req.routeOptions?.url,
    playerId: safeDecode(req.headers?.['x-player-id']),
    qqGroup: safeDecode(req.headers?.['x-qq-group']),
    ip: req.ip
  });
}

/**
 * Throws unless the request carries a valid x-admin-token header.
 * Fails closed when ADMIN_TOKEN is not configured.
 */
export function requireAdmin(fastify, req) {
  if (!isAdminConfigured()) {
    audit(fastify, req, 'admin.not_configured', 'error');
    throw fastify.httpErrors.serviceUnavailable(
      'Admin access is disabled: ADMIN_TOKEN is not configured on the server.'
    );
  }
  if (!isAdminRequest(req)) {
    audit(fastify, req, 'admin.denied', 'warn');
    throw fastify.httpErrors.unauthorized('Admin token required.');
  }
  audit(fastify, req, 'admin.authorized', 'info');
}

/**
 * Throws 403 (code PLAYER_KEY_REQUIRED) when the player ID is bound to a
 * device key and the request does not carry it. IDs not bound yet pass.
 */
async function requirePlayerKey(fastify, req, playerId) {
  const hash = await storedKeyHash(fastify.db, playerId);
  if (!hash || playerKeyMatches(requestPlayerKey(req), hash)) return;
  audit(fastify, req, 'auth.key_denied', 'warn');
  const err = fastify.httpErrors.forbidden(
    '该选手 ID 已绑定其他设备。请在已绑定的设备上复制「设备密钥」并在这里导入，或联系管理员重置。'
  );
  err.code = 'PLAYER_KEY_REQUIRED';
  throw err;
}

/**
 * Allows either an admin or the player the request is acting for (with the
 * player's device key once the ID is bound).
 * Used for self-service operations (registration, profile, votes, account links).
 */
export async function requireSelfOrAdmin(fastify, req, playerId) {
  if (isAdminRequest(req)) {
    audit(fastify, req, 'admin.authorized', 'info');
    return;
  }
  const requesterId = getRequesterId(req);
  if (requesterId && playerId != null && requesterId === String(playerId)) {
    await requirePlayerKey(fastify, req, requesterId);
    audit(fastify, req, 'auth.self', 'info');
    return;
  }
  audit(fastify, req, 'auth.denied', 'warn');
  throw fastify.httpErrors.forbidden(
    'You may only perform this action for your own player ID.'
  );
}

/**
 * Allows either an admin or one of the two players in the match (with that
 * player's device key once the ID is bound).
 * Used for match result reporting so unrelated users cannot rewrite scores.
 */
export async function requireMatchPlayerOrAdmin(fastify, req, match) {
  if (isAdminRequest(req)) {
    audit(fastify, req, 'admin.authorized', 'info');
    return;
  }
  const requesterId = getRequesterId(req);
  const participant =
    requesterId != null &&
    (requesterId === match?.player1_id || requesterId === match?.player2_id);
  if (participant) {
    await requirePlayerKey(fastify, req, requesterId);
    audit(fastify, req, 'auth.match_player', 'info');
    return;
  }
  audit(fastify, req, 'auth.denied', 'warn');
  throw fastify.httpErrors.forbidden(
    'Only the players in this match (or an admin) may report its result.'
  );
}
