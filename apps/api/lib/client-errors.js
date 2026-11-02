// Errors reported by visitors' browsers (POST /client-errors): cleaned to
// bounded strings and given a fingerprint (message + first stack frame,
// with numbers and hashes taken out) so repeats count on one row.

import { createHash } from 'node:crypto';

export const CLIENT_ERROR_LIMITS = { message: 500, stack: 4000, page: 300, userAgent: 300 };
export const KEEP_CLIENT_ERRORS = 500;

const text = (value, max) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

/** A cleaned report, or { error } when there is nothing to keep. */
export function cleanClientError(body = {}) {
  const message = text(body.message, CLIENT_ERROR_LIMITS.message);
  if (!message) return { error: 'message is required' };
  const stack = text(body.stack, CLIENT_ERROR_LIMITS.stack);
  // Only the path of the page: no query string or hash (may carry IDs).
  let page = text(body.page, CLIENT_ERROR_LIMITS.page);
  try {
    page = new URL(page, 'http://x').pathname;
  } catch {
    page = '';
  }
  return { report: { message, stack, page, userAgent: text(body.userAgent, CLIENT_ERROR_LIMITS.userAgent) } };
}

/** Same error, same row: message and first stack line without volatile parts. */
export function fingerprint({ message, stack }) {
  const frame = String(stack || '').split('\n').find((l) => /\bat\b|@/.test(l)) || '';
  const norm = (s) => s.replace(/[0-9a-f]{8,}/gi, '#').replace(/\d+/g, 'N').replace(/\?[^\s)]*/g, '');
  return createHash('sha1').update(`${norm(message)}|${norm(frame)}`).digest('hex');
}
