#!/usr/bin/env node
// The control panel of wt-autoscene (what the .exe runs, see build-exe.mjs):
// a small web server on 127.0.0.1 that serves panel.html and drives the
// engine (engine.mjs), opened as an app window of Edge or Chrome (any
// browser if neither is found). Settings live in config.json next to the
// .exe (the same file the command line reads). Starting it again while it
// runs only opens the window again.
//
// Only this computer can reach the panel, and every request needs the key
// in the window's address (a page on another site cannot drive it), JSON
// bodies (no form posts) and the 127.0.0.1 Host (no DNS rebinding).
//
//   node panel.mjs [--dir <folder for config.json>] [--port 47115] [--no-open]

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_FILE, applyChanges, panelEngineConfig } from './config.mjs';
import { configProblems, createEngine, obsSceneList, probeGame } from './engine.mjs';

/* global __PANEL_HTML__, __VERSION__ */
export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
export const APP = 'potato-cup-autoscene';
export const PANEL_PORT = 47115;
const LOG_KEEP = 500;

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string' },
    port: { type: 'string' },
    'no-open': { type: 'boolean', default: false },
  },
});

const here = process.pkg ? dirname(process.execPath) : import.meta.url ? dirname(fileURLToPath(import.meta.url)) : process.cwd();
const appDir = args.dir || here;
const configPath = join(appDir, 'config.json');
const PAGE = typeof __PANEL_HTML__ !== 'undefined' ? __PANEL_HTML__ : readFileSync(join(here, 'panel.html'), 'utf8');

// ------------------------------------------------------------------ config

function loadConfig() {
  if (!existsSync(configPath)) return { ...DEFAULT_FILE };
  try {
    return { ...DEFAULT_FILE, ...JSON.parse(readFileSync(configPath, 'utf8')) };
  } catch (e) {
    log(`读取 ${configPath} 失败（${e.message}），使用默认设置`);
    return { ...DEFAULT_FILE };
  }
}

function saveConfig() {
  mkdirSync(appDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(file, null, 2) + '\n');
}

const engineConfigOf = (f) => panelEngineConfig(f, appDir);

/** What the page sees: config.json without the secrets. */
function publicConfig() {
  const { adminToken, obsPassword, ...rest } = file;
  return { ...rest, adminTokenSet: Boolean(adminToken), obsPasswordSet: Boolean(obsPassword) };
}

const overlayUrl = (f) => (f.site && f.event ? `${f.site}/tournament/${encodeURIComponent(f.event)}/overlay?channel=${f.channel || 1}` : '');

// ------------------------------------------------------------------ engine

const logs = [];
let logId = 0;
const clients = new Set();

function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

function log(msg) {
  const entry = { id: ++logId, at: Date.now(), msg };
  logs.push(entry);
  if (logs.length > LOG_KEEP) logs.shift();
  console.log(new Date(entry.at).toLocaleTimeString(), msg);
  broadcast('log', entry);
}

const engine = createEngine({
  onLog: ({ msg }) => log(msg),
  onChange: (status) => broadcast('status', status),
});

let file = loadConfig();

function startEngine() {
  engine.start(engineConfigOf(file));
}

// ------------------------------------------------------------------ site / OBS checks

async function checkSite({ site, token }) {
  const base = String(site || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]/.test(base)) return { ok: false, error: '网站地址要以 https:// 开头' };
  const get = (path, headers = {}) => fetch(`${base}/api${path}`, { headers, signal: AbortSignal.timeout(8000) });
  let events;
  try {
    const res = await get('/tournaments');
    if (!res.ok) return { ok: false, error: `网站返回 ${res.status}（地址对吗？）` };
    events = await res.json();
  } catch (e) {
    return { ok: false, error: `连不上网站（${e.cause?.code || e.message}）` };
  }
  const list = (Array.isArray(events) ? events : events?.tournaments || [])
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => (a.status === 'in_progress' ? 0 : 1) - (b.status === 'in_progress' ? 0 : 1) || String(b.scheduled_time || '').localeCompare(String(a.scheduled_time || '')))
    .map((t) => ({ id: t.id, name: t.name, status: t.status, scheduled_time: t.scheduled_time || '' }));
  let admin = null;
  if (token) {
    try {
      const res = await get('/admin/session', { 'x-admin-token': token });
      admin = res.ok;
    } catch {
      admin = null;
    }
  }
  return { ok: true, admin, events: list };
}

// ------------------------------------------------------------------ server

const key = randomBytes(16).toString('hex');
let port = Number(args.port) || PANEL_PORT;

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...(type.startsWith('text/html') ? { 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" } : {}),
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new Error('too large');
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function stateBody() {
  return {
    version: VERSION,
    config: publicConfig(),
    configPath,
    problems: configProblems(engineConfigOf(file)),
    status: engine.status(),
    logs,
    overlayUrl: overlayUrl(file),
  };
}

const ROUTES = {
  'GET /api/state': () => stateBody(),
  'POST /api/config': async (body) => {
    file = applyChanges(file, body);
    saveConfig();
    log('设置已保存');
    let restartError = '';
    if (engine.running) {
      try {
        startEngine();
        log('已按新设置重新开始');
      } catch (e) {
        engine.stop();
        restartError = e.message;
      }
    }
    return { ...stateBody(), restartError };
  },
  'POST /api/start': () => {
    startEngine();
    return stateBody();
  },
  'POST /api/stop': () => {
    engine.stop();
    return stateBody();
  },
  'POST /api/pause': async (body) => {
    await engine.setPaused(Boolean(body.paused));
    return stateBody();
  },
  'POST /api/test/site': (body) => checkSite({ site: body.site ?? file.site, token: body.token || file.adminToken }),
  'POST /api/test/game': (body) => probeGame(String(body.game || file.game)),
  'POST /api/test/obs': async (body) => {
    try {
      return { ok: true, scenes: await obsSceneList(String(body.obs || file.obs), body.obsPassword || file.obsPassword) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
  'POST /api/open': (body) => {
    // Only the site's pages and the program folder.
    const url = String(body.url || '');
    if (body.folder) openExternal(appDir, true);
    else if (file.site && (url === file.site || url.startsWith(`${file.site}/`))) openExternal(url);
    else throw new Error('不能打开这个地址');
    return { ok: true };
  },
  'POST /api/quit': () => {
    setTimeout(() => {
      engine.stop({ quiet: true });
      process.exit(0);
    }, 200);
    return { ok: true };
  },
};

function handler(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const hostOk = req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;
  if (!hostOk) return send(res, 403, { message: 'forbidden' });
  if (req.method === 'GET' && url.pathname === '/ping') return send(res, 200, { app: APP, version: VERSION, key });
  if (req.method === 'GET' && url.pathname === '/favicon.ico') return send(res, 204, '');
  const keyOk = req.headers['x-panel-key'] === key || url.searchParams.get('k') === key;
  if (req.method === 'GET' && url.pathname === '/') {
    if (!keyOk) return send(res, 403, '<!doctype html><meta charset="utf-8"><p style="font:16px sans-serif;padding:24px">请双击程序打开面板（地址里缺少密钥）。</p>', 'text/html; charset=utf-8');
    return send(res, 200, PAGE, 'text/html; charset=utf-8');
  }
  if (!keyOk) return send(res, 403, { message: 'forbidden' });
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`event: status\ndata: ${JSON.stringify(engine.status())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return undefined;
  }
  const route = ROUTES[`${req.method} ${url.pathname}`];
  if (!route) return send(res, 404, { message: 'not found' });
  if (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { message: 'JSON only' });
  (async () => {
    const body = req.method === 'POST' ? await readBody(req) : {};
    return route(body);
  })().then(
    (out) => send(res, 200, out),
    (e) => send(res, 400, { message: e.message }),
  );
  return undefined;
}

// ------------------------------------------------------------------ window

function openExternal(target, folder = false) {
  const opts = { detached: true, stdio: 'ignore' };
  if (process.platform === 'win32') spawn('explorer.exe', [target], opts).unref();
  else if (process.platform === 'darwin') spawn('open', [target], opts).unref();
  else spawn('xdg-open', [target], opts).on('error', () => {}).unref();
  return folder;
}

/** The panel as an app window (Edge / Chrome, own profile), else the default browser. */
function openPanel(url) {
  if (args['no-open']) return;
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    const browsers = [
      ...roots.map((r) => join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
      ...roots.map((r) => join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ];
    const exe = browsers.find((p) => existsSync(p));
    if (exe) {
      const profile = join(process.env.LOCALAPPDATA || appDir, 'PotatoCupAutoScene', 'panel-window');
      spawn(exe, [`--app=${url}`, '--window-size=1200,900', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
  }
  openExternal(url);
}

// Already running: open its window instead.
async function existing(p) {
  try {
    const res = await fetch(`http://127.0.0.1:${p}/ping`, { signal: AbortSignal.timeout(1500) });
    const body = await res.json();
    return body.app === APP ? body : null;
  } catch {
    return null;
  }
}

async function listen() {
  for (let i = 0; i < 6; i += 1, port += 1) {
    const other = await existing(port);
    if (other) return { other };
    const server = http.createServer(handler);
    const ok = await new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (ok) return { server };
  }
  throw new Error(`端口 ${PANEL_PORT}-${port} 都被占用了`);
}

async function main() {
  process.title = '土豆杯 · 自动切换直播画面';
  const { other } = await listen();
  if (other) {
    console.log('程序已经在运行，打开它的面板。');
    openPanel(`http://127.0.0.1:${port}/?k=${other.key}`);
    setTimeout(() => process.exit(0), 500);
  } else {
    const url = `http://127.0.0.1:${port}/?k=${key}`;
    console.log(`土豆杯 · 自动切换直播画面 ${VERSION}`);
    console.log(`面板：${url}`);
    console.log(`设置文件：${configPath}`);
    console.log('关闭本窗口就会退出程序（面板窗口可以随时关掉，双击程序重新打开）。\n');
    if (file.autoStart) {
      try {
        startEngine();
      } catch (e) {
        log(`没有自动开始：${e.message}`);
      }
    }
    openPanel(url);
  }
}

main().catch((e) => {
  console.error(e.message);
  setTimeout(() => process.exit(1), 10_000);
});
