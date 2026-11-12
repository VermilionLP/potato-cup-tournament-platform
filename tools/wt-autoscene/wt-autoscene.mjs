#!/usr/bin/env node
// War Thunder → live overlay. Runs on the streaming PC (the one with the
// spectating game client and OBS): polls the game's local web map API and
// reports the game state of one live channel to the site (hangar / battle /
// ended, every 10 s and on each change). The site's overlay follows it — a
// battle shows the HUD, its end the bracket — with its own transitions, so
// OBS needs one scene only. Optionally it also switches OBS scenes. P pauses
// and resumes (the site's console can too). Node 22+, no dependencies. See
// README.md.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';
import { detectState, nextScene, obsAuth, reportState, stateTracker } from './detect.mjs';
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
    'min-battle': { type: 'string' },
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
  把游戏状态（机库 / 战斗中 / 本局结束）报给网站，网站大屏自己切换画面（带转场）
  --end-delay 8        战斗结束后等几秒再报告（让观众看完结算）
  --min-battle 60      战斗不满几秒就退出的不算比赛结束（掉线、进错房间）
  运行中按 P 暂停 / 恢复自动切换（网站控制台也能暂停）
  --obs ws://127.0.0.1:4455   另外切 OBS 场景（可选；密码放在环境变量 OBS_PASSWORD 或 config.json 的 obsPassword）
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
  const res = await fetch(opt.game + path, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

let lastRecorded = '';
let recordFailed = false;
let lastReadError = '';
let everReached = false;

// One line per change, without the per-frame map grid. Write errors are
// reported, never mistaken for the game being offline.
function record(entry) {
  if (!opt.record || recordFailed) return;
  const line = JSON.stringify(entry);
  if (line === lastRecorded) return;
  lastRecorded = line;
  try {
    appendFileSync(opt.record, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  } catch (e) {
    recordFailed = true;
    log(`写入记录文件失败（${e.message}），之后不再记录`);
  }
}

async function readGame() {
  let snap;
  try {
    const [mapInfo, mission] = await Promise.all([getJson('/map_info.json'), getJson('/mission.json').catch(() => null)]);
    snap = { reachable: true, mapInfo, mission };
    lastReadError = '';
    everReached = true;
  } catch (e) {
    const reason = e.cause?.code || e.name || e.message;
    if (reason !== lastReadError) {
      lastReadError = reason;
      // Loading or leaving a battle: the client stops answering for a few seconds.
      if (everReached) log('游戏接口暂时无响应（加载或退出战斗时正常）');
      else log(`读不到游戏接口 ${opt.game}（${reason}）：游戏没开、还在启动，或接口被防火墙拦截`);
    }
    record({ state: 'offline', error: String(reason) });
    return { reachable: false };
  }
  const { grid_steps, grid_zero, grid_size, map_min, map_max, ...info } = snap.mapInfo || {};
  record({ state: detectState(snap), map_info: info, mission: snap.mission });
  return snap;
}

// ---------------------------------------------------------------- site

let paused = false;
let reported = null; // the game state last sent (or to send) to the site

// The window title shows what the script is doing.
function title() {
  const what = paused ? '已暂停（按 P 恢复）' : { battle: '战斗中', hangar: '机库', ended: '本局结束' }[reported] || '等待游戏';
  if (process.stdout.isTTY) process.stdout.write(`\x1b]0;自动切换 · ${what}\x07`);
}

async function siteRequest(path, init = {}) {
  const res = await fetch(`${base}/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-admin-token': token, ...(init.headers || {}) },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.slice(0, 200));
  return res.json();
}

// Tells the site the channel's game state; the answer says whether
// automation is paused (from the console or P here).
async function reportGame(state, { quiet = false } = {}) {
  if (!siteOn || !state) return;
  if (opt['dry-run']) return quiet || log(`[试运行] 网站频道 ${channel}: ${state}`);
  const res = await siteRequest(`/tournaments/${encodeURIComponent(opt.event)}/game-state`, {
    method: 'POST',
    body: JSON.stringify({ channel, state }),
  });
  if (!quiet) log(`网站频道 ${channel}: ${{ battle: '战斗中', hangar: '机库', ended: '本局结束' }[state]}`);
  if (Boolean(res.paused) !== paused) {
    paused = Boolean(res.paused);
    log(paused ? '网站控制台暂停了自动切换（按 P 恢复）' : '网站控制台恢复了自动切换');
    title();
  }
}

async function setPaused(next) {
  paused = next;
  title();
  log(paused ? '已暂停自动切换：大屏和 OBS 不再跟随游戏（按 P 恢复）' : '已恢复自动切换');
  if (siteOn && !opt['dry-run']) {
    await siteRequest(`/tournaments/${encodeURIComponent(opt.event)}/autoscene`, {
      method: 'POST',
      body: JSON.stringify({ channel, paused }),
    }).catch((e) => log('通知网站暂停状态失败:', e.message));
  }
  // Back on: catch OBS up with the game.
  if (!paused && shownState) setObsScene(obsSceneOf(shownState)).catch(() => {});
}

// Every 10 s: the site counts the script gone after 75 s without news.
const HEARTBEAT_MS = 10_000;
setInterval(() => {
  if (reported) reportGame(reported, { quiet: true }).catch((e) => log('连接网站失败:', e.message));
}, HEARTBEAT_MS).unref();

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
  if (!opt.obs || !name || paused) return;
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

let shownState = null; // last scene whose OBS scene was applied
let battleStart = null; // when the current battle was first seen
let battleMs = null; // how long the last battle lasted
const obsSceneOf = (state) => ({ battle: opt['obs-battle'], ended: opt['obs-ended'], hangar: opt['obs-hangar'] })[state];

async function apply(scene) {
  shownState = scene;
  const state = reportState(scene, battleMs, Number(opt['min-battle']) * 1000);
  if (scene === 'ended' && state === 'hangar') log(`战斗只持续了 ${Math.round(battleMs / 1000)} 秒，不算比赛结束`);
  reported = state;
  title();
  await Promise.all([
    reportGame(state).catch((e) => log('连接网站失败:', e.message)),
    setObsScene(obsSceneOf(state === 'hangar' && scene === 'ended' ? 'hangar' : scene)).catch((e) => log('OBS 切换失败:', e.message)),
  ]);
}

let lastActive = null; // last state that was not "offline"

async function tick() {
  const change = track(detectState(await readGame()));
  if (change) {
    log(`状态: ${NAMES[change.from] || '启动'} → ${NAMES[change.to]}`);
    if (change.to === 'battle' && !battleStart) battleStart = Date.now();
    if (lastActive === 'battle' && change.to === 'hangar' && battleStart) {
      battleMs = Date.now() - battleStart;
      battleStart = null;
    }
    const next = nextScene(lastActive, change.to);
    if (change.to !== 'offline') lastActive = change.to;
    if (next) {
      clearTimeout(pending);
      pending = null;
      if (next.delayed) {
        // Let viewers see the result first; back in a battle by then = nothing happened.
        log(`离开战斗，${opt['end-delay']} 秒后报告`);
        pending = setTimeout(() => apply(next.scene), Number(opt['end-delay']) * 1000);
      } else {
        await apply(next.scene);
      }
    }
  }
  setTimeout(tick, Number(opt.interval));
}

// P pauses / resumes; Ctrl+C quits.
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    const key = buf.toString();
    if (key === '\u0003') process.exit(0);
    if (key === 'p' || key === 'P') setPaused(!paused);
  });
}

connectObs();
title();
log(`开始读取 ${opt.game}` + (siteOn ? `，赛事 ${opt.event} 频道 ${channel}` : '') + (opt.record ? `，记录到 ${resolvePath(opt.record)}` : '（未开启记录）') + (opt['dry-run'] ? '（试运行）' : '') + '。按 P 暂停 / 恢复，Ctrl+C 退出');
tick();
