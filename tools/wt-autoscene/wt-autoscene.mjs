#!/usr/bin/env node
// War Thunder → live scene switcher. Runs on the streaming PC (the one with
// the spectating game client and OBS): polls the game's local web map API,
// and when a battle starts / ends / returns to the hangar it switches the
// event's overlay scene on the site (one live channel) and, optionally, the
// OBS program scene. Node 22+, no dependencies. See README.md.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { detectState, obsAuth, stateTracker } from './detect.mjs';
import { mergeOptions } from './config.mjs';

const { values: cli } = parseArgs({
  options: {
    config: { type: 'string' },
    site: { type: 'string' },
    event: { type: 'string' },
    channel: { type: 'string' },
    game: { type: 'string' },
    interval: { type: 'string' },
    stable: { type: 'string' },
    'end-delay': { type: 'string' },
    'scene-battle': { type: 'string' },
    'scene-ended': { type: 'string' },
    'scene-hangar': { type: 'string' },
    obs: { type: 'string' },
    'obs-battle': { type: 'string' },
    'obs-ended': { type: 'string' },
    'obs-hangar': { type: 'string' },
    record: { type: 'string' },
    'dry-run': { type: 'boolean' },
    ask: { type: 'boolean' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (cli.help) {
  console.log(`用法: node wt-autoscene.mjs --site https://你的网站 --event <赛事ID> [--channel 1]
  或: node wt-autoscene.mjs --config config.json   （一键启动用 start-autoscene.bat）
  管理员令牌放在环境变量 POTATO_ADMIN_TOKEN 或 config.json 的 adminToken
  --scene-battle/--scene-ended/--scene-hangar  网站大屏场景（auto|intro|ingame|intermission|hybrid，none = 不切）
  --end-delay 8        战斗结束后等几秒再切
  --obs ws://127.0.0.1:4455   同时切 OBS 场景（密码放在环境变量 OBS_PASSWORD 或 config.json 的 obsPassword）
  --obs-battle/--obs-ended/--obs-hangar  对应的 OBS 场景名
  --record log.jsonl   记录游戏接口返回的原始数据（用来校准）
  --ask                启动时询问赛事 ID 和频道（回车沿用上次的值）
  --dry-run            只打印，不切换`);
  process.exit(0);
}

// Config file (config.json next to the script, made by start-autoscene.bat):
// command-line options win over it, it wins over the defaults.
let fileConfig = {};
if (cli.config) {
  try {
    fileConfig = JSON.parse(readFileSync(cli.config, 'utf8'));
  } catch (e) {
    console.error(`读取配置文件 ${cli.config} 失败: ${e.message}`);
    process.exit(1);
  }
}
const opt = mergeOptions(cli, fileConfig);

// Ask for the event and channel (Enter keeps the last ones, saved back);
// only when the site's overlay is switched, OBS alone needs neither.
if (opt.ask && opt.site && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const event = (await rl.question(`赛事 ID${opt.event ? ` [${opt.event}]` : ''}: `)).trim();
  const ch = (await rl.question(`直播频道 [${opt.channel}]: `)).trim();
  rl.close();
  if (event) opt.event = event;
  if (ch) opt.channel = ch;
  if (cli.config && (event || ch)) {
    writeFileSync(cli.config, JSON.stringify({ ...fileConfig, event: opt.event, channel: Number(opt.channel) }, null, 2) + '\n');
  }
}

const token = process.env.POTATO_ADMIN_TOKEN || fileConfig.adminToken || '';
const obsPassword = process.env.OBS_PASSWORD || fileConfig.obsPassword || '';
const siteOn = Boolean(opt.site && opt.event);
if (!siteOn && !opt.obs && !opt.record) {
  console.error('至少需要网站地址和赛事 ID（切网站大屏），或 OBS 地址（切 OBS），或记录文件。--help 查看用法');
  process.exit(1);
}
if (siteOn && !token && !opt['dry-run']) {
  console.error('缺少管理员令牌：请在 config.json 填写 adminToken，或设置环境变量 POTATO_ADMIN_TOKEN');
  process.exit(1);
}
if (!Number.isInteger(Number(opt.channel)) || Number(opt.channel) < 1 || Number(opt.channel) > 9) {
  console.error('直播频道必须是 1-9');
  process.exit(1);
}

const channel = Number(opt.channel);
const base = (opt.site || '').replace(/\/+$/, '');
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// ---------------------------------------------------------------- game API

async function getJson(path) {
  const res = await fetch(opt.game + path, { signal: AbortSignal.timeout(1500) });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

let lastRecorded = '';
async function readGame() {
  try {
    const [mapInfo, mission] = await Promise.all([getJson('/map_info.json'), getJson('/mission.json').catch(() => null)]);
    const snap = { reachable: true, mapInfo, mission };
    if (opt.record) {
      // Only changes, without the per-frame map grid.
      const { grid_steps, grid_zero, grid_size, map_min, map_max, ...info } = mapInfo || {};
      const line = JSON.stringify({ map_info: info, mission });
      if (line !== lastRecorded) {
        lastRecorded = line;
        appendFileSync(opt.record, JSON.stringify({ at: new Date().toISOString(), state: detectState(snap), map_info: info, mission }) + '\n');
      }
    }
    return snap;
  } catch {
    return { reachable: false };
  }
}

// ---------------------------------------------------------------- site

async function siteRequest(path, init = {}) {
  const res = await fetch(`${base}/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-admin-token': token, ...(init.headers || {}) },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.slice(0, 200));
  return res.json();
}

async function setSiteScene(scene) {
  if (!siteOn || !scene || scene === 'none') return;
  if (opt['dry-run']) return log(`[试运行] 网站频道 ${channel} → ${scene}`);
  // Keep the channel's round / stage: the endpoint replaces the round.
  const event = await siteRequest(`/tournaments/${encodeURIComponent(opt.event)}`);
  const current = (event.live_channels || []).find((c) => c.channel === channel) || {};
  if (current.overlay_scene === scene) return;
  await siteRequest(`/tournaments/${encodeURIComponent(opt.event)}/overlay-state`, {
    method: 'POST',
    body: JSON.stringify({ channel, overlay_scene: scene, overlay_round: current.overlay_round ?? null }),
  });
  log(`网站频道 ${channel} → ${scene}`);
}

// ---------------------------------------------------------------- OBS

let obs = null;
let obsWarned = false;
let lastObsScene = null;
let obsReady = null;
let requestId = 0;

function connectObs() {
  if (!opt.obs) return;
  obsReady = new Promise((resolve) => {
    const ws = new WebSocket(opt.obs);
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.op === 0) {
        const auth = msg.d.authentication;
        const d = { rpcVersion: 1 };
        if (auth) d.authentication = await obsAuth(obsPassword, auth.salt, auth.challenge);
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) {
        obs = ws;
        obsWarned = false;
        lastObsScene = null;
        log('已连接 OBS');
        resolve(true);
        // Connected late (OBS opened after this): catch up with the game.
        if (shownState) setObsScene(obsSceneOf(shownState)).catch(() => {});
      } else if (msg.op === 7 && !msg.d.requestStatus?.result) {
        log('OBS 切换失败:', msg.d.requestStatus?.comment || msg.d.requestStatus?.code);
      }
    };
    // A refused connection fires only "error", a dropped one "close":
    // handle whichever comes first, once.
    let done = false;
    const lost = (code) => {
      if (done) return;
      done = true;
      if (obs === ws) log('OBS 连接断开，5 秒后重连');
      else if (code === 4009) log('OBS 密码不对：请检查 obsPassword（OBS → 工具 → WebSocket 服务器设置）');
      else if (!obsWarned) log('连不上 OBS：请确认 OBS 已打开，并在"工具 → WebSocket 服务器设置"里启用了服务器；之后每 5 秒自动重试');
      obsWarned = obs !== ws;
      obs = null;
      resolve(false);
      setTimeout(connectObs, 5000);
    };
    ws.onclose = (ev) => lost(ev.code);
    ws.onerror = () => setTimeout(() => lost(0), 100);
  });
}

async function setObsScene(name) {
  if (!opt.obs || !name) return;
  if (opt['dry-run']) return log(`[试运行] OBS → ${name}`);
  if (!obs) await Promise.race([obsReady, new Promise((r) => setTimeout(r, 2000))]);
  if (!obs) return log('OBS 未连接，跳过切换');
  if (name === lastObsScene) return;
  lastObsScene = name;
  obs.send(JSON.stringify({ op: 6, d: { requestType: 'SetCurrentProgramScene', requestId: String(++requestId), requestData: { sceneName: name } } }));
  log(`OBS → ${name}`);
}

// ---------------------------------------------------------------- loop

const NAMES = { offline: '游戏未运行', hangar: '机库', battle: '战斗中', ended: '战斗结束' };
const track = stateTracker(Number(opt.stable));
let pending = null;

let shownState = null; // last state whose scenes were applied
const obsSceneOf = (state) => ({ battle: opt['obs-battle'], ended: opt['obs-ended'], hangar: opt['obs-hangar'] })[state];

async function apply(state) {
  shownState = state;
  const site = { battle: opt['scene-battle'], ended: opt['scene-ended'], hangar: opt['scene-hangar'] }[state];
  const obsScene = obsSceneOf(state);
  await Promise.all([
    setSiteScene(site).catch((e) => log('网站切换失败:', e.message)),
    setObsScene(obsScene).catch((e) => log('OBS 切换失败:', e.message)),
  ]);
}

async function tick() {
  const change = track(detectState(await readGame()));
  if (change) {
    log(`状态: ${NAMES[change.from] || '启动'} → ${NAMES[change.to]}`);
    clearTimeout(pending);
    pending = null;
    if (change.to === 'ended') {
      // Let viewers see the result screen first.
      pending = setTimeout(() => apply('ended'), Number(opt['end-delay']) * 1000);
    } else if (change.to !== 'offline') {
      await apply(change.to);
    }
  }
  setTimeout(tick, Number(opt.interval));
}

connectObs();
log(`开始读取 ${opt.game}` + (siteOn ? `，赛事 ${opt.event} 频道 ${channel}` : '') + (opt.record ? `，记录到 ${opt.record}` : '') + (opt['dry-run'] ? '（试运行）' : ''));
tick();
