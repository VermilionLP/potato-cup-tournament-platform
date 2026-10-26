import os from 'os';
import { isAdminRequest } from './admin.js';

const SERVICE_NAME = 'suck-tournament-api';
const DEFAULT_ES_URL = 'http://127.0.0.1:9200';
const DEFAULT_INDEX_PREFIX = 'suck-api-logs';
const DEFAULT_FLUSH_MS = 5000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_BUFFER = 5000;
const MAX_STRING = 4000;

function parseBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function truncate(value, max = MAX_STRING) {
  if (typeof value !== 'string') return value;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function safeDecode(value) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function sanitizeIndexPrefix(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-_+]+/, '')
    .replace(/-+$/, '');
  return cleaned || DEFAULT_INDEX_PREFIX;
}

function utcDateStamp(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return safe.toISOString().slice(0, 10).replaceAll('-', '.');
}

/**
 * Buffered, non-blocking Elasticsearch logger.
 *
 * Configuration:
 *   ES_ENABLED=false            disable entirely (default: true)
 *   ES_URL                      default http://127.0.0.1:9200
 *   ES_USERNAME / ES_PASSWORD   optional basic auth
 *   ES_API_KEY                  optional API key auth (takes precedence)
 *   ES_INDEX                    index prefix, default suck-api-logs
 *   ES_INDEX_DAILY=false        write one index instead of daily indices
 *   ES_BATCH_SIZE               docs per bulk request, default 100
 *   ES_FLUSH_MS                 flush interval, default 5000
 *   ES_TIMEOUT_MS               request timeout, default 5000
 */
export function createEsLogger(overrides = {}) {
  const baseUrl = String(
    overrides.url ?? process.env.ES_URL ?? DEFAULT_ES_URL
  ).trim().replace(/\/+$/, '');
  const indexPrefix = sanitizeIndexPrefix(
    overrides.index ?? process.env.ES_INDEX ?? DEFAULT_INDEX_PREFIX
  );
  const username = overrides.username ?? process.env.ES_USERNAME ?? '';
  const password = overrides.password ?? process.env.ES_PASSWORD ?? '';
  const apiKey = overrides.apiKey ?? process.env.ES_API_KEY ?? '';
  const enabled =
    parseBool(overrides.enabled ?? process.env.ES_ENABLED, true) && Boolean(baseUrl);
  const dailyIndex = parseBool(
    overrides.dailyIndex ?? process.env.ES_INDEX_DAILY,
    true
  );
  const flushMs = parsePositiveInt(
    overrides.flushMs ?? process.env.ES_FLUSH_MS,
    DEFAULT_FLUSH_MS
  );
  const batchSize = parsePositiveInt(
    overrides.batchSize ?? process.env.ES_BATCH_SIZE,
    DEFAULT_BATCH_SIZE
  );
  const timeoutMs = parsePositiveInt(
    overrides.timeoutMs ?? process.env.ES_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const env = process.env.NODE_ENV || 'production';
  const host = (() => {
    try {
      return os.hostname();
    } catch (_) {
      return 'unknown';
    }
  })();

  const auth = apiKey
    ? `ApiKey ${apiKey}`
    : username
      ? `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
      : null;

  let buffer = [];
  let timer = null;
  let activeFlush = null;
  let lastWarningAt = 0;

  function warn(message) {
    const now = Date.now();
    if (now - lastWarningAt < 60000) return;
    lastWarningAt = now;
    console.warn(`[es-logger] ${message}`);
  }

  function indexFor(isoTimestamp) {
    return dailyIndex ? `${indexPrefix}-${utcDateStamp(isoTimestamp)}` : indexPrefix;
  }

  function enqueue(doc) {
    if (!enabled) return;
    const entry = {
      '@timestamp': new Date().toISOString(),
      service: SERVICE_NAME,
      env,
      host,
      ...doc
    };
    if (buffer.length >= MAX_BUFFER) buffer.shift();
    buffer.push(entry);
    if (buffer.length >= batchSize) {
      queueMicrotask(() => {
        flush().catch(() => {});
      });
    }
  }

  function log(doc) {
    enqueue(doc);
  }

  function audit(doc) {
    enqueue({ level: 'info', event: 'audit', ...doc });
  }

  async function doFlush(batch) {
    const lines = [];
    for (const doc of batch) {
      lines.push(JSON.stringify({ index: { _index: indexFor(doc['@timestamp']) } }));
      lines.push(JSON.stringify(doc));
    }
    const body = `${lines.join('\n')}\n`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/_bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-ndjson',
          Accept: 'application/json',
          ...(auth ? { Authorization: auth } : {})
        },
        body,
        signal: controller.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? `: ${truncate(text, 300)}` : ''}`);
      }
      const payload = await res.json().catch(() => null);
      if (payload?.errors) {
        const failed = Array.isArray(payload.items)
          ? payload.items.filter((item) => item?.index?.error).length
          : 'unknown';
        warn(`bulk request had ${failed} failed document(s)`);
      }
    } catch (err) {
      warn(`failed to ship ${batch.length} log(s) to ${baseUrl}: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function flush() {
    if (!enabled || buffer.length === 0) return;
    if (activeFlush) {
      await activeFlush;
      if (buffer.length > 0) await flush();
      return;
    }
    const batch = buffer;
    buffer = [];
    activeFlush = doFlush(batch).finally(() => {
      activeFlush = null;
    });
    await activeFlush;
  }

  function start() {
    if (!enabled || timer) return;
    timer = setInterval(() => {
      flush().catch(() => {});
    }, flushMs);
    timer.unref?.();
  }

  async function close() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    for (let i = 0; i < 10 && (buffer.length > 0 || activeFlush); i += 1) {
      await flush();
      if (activeFlush) await activeFlush;
    }
  }

  start();

  return {
    enabled,
    url: baseUrl,
    indexPrefix,
    log,
    audit,
    flush,
    close
  };
}

function shouldLogRequest(req, logAll) {
  if (req.method === 'OPTIONS') return false;
  if (logAll) return true;
  return req.url.startsWith('/api');
}

function requestLevel(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/**
 * Adds Fastify hooks that ship request/response metadata and errors to ES.
 * Request bodies and headers are never sent, so tokens stay out of the index.
 */
export function registerRequestLogging(fastify, esLogger) {
  if (!esLogger?.enabled) return;
  const logAll = parseBool(process.env.ES_LOG_ALL_REQUESTS, false);

  fastify.addHook('onRequest', async (req) => {
    req.esStartedAt = process.hrtime.bigint();
  });

  fastify.addHook('onError', async (req, reply, error) => {
    req.esError = {
      name: error.name,
      message: truncate(error.message),
      code: error.code,
      statusCode: error.statusCode,
      stack: truncate(error.stack)
    };
  });

  fastify.addHook('onResponse', async (req, reply) => {
    if (!shouldLogRequest(req, logAll)) return;
    const durationMs = req.esStartedAt
      ? Number(process.hrtime.bigint() - req.esStartedAt) / 1e6
      : reply.elapsedTime;
    esLogger.log({
      level: requestLevel(reply.statusCode),
      event: 'request',
      message: `${req.method} ${req.url} ${reply.statusCode}`,
      reqId: req.id,
      method: req.method,
      path: req.url,
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
      userAgent: truncate(req.headers['user-agent'], 300),
      playerId: safeDecode(req.headers['x-player-id']),
      qqGroup: safeDecode(req.headers['x-qq-group']),
      admin: isAdminRequest(req),
      error: req.esError
    });
  });

  fastify.addHook('onClose', async () => {
    await esLogger.close();
  });
}
