#!/usr/bin/env node
// War Thunder → live overlay. Runs on the streaming PC (the one with the
// spectating game client and OBS): polls the game's local web map API and
// reports the game state of one live channel to the site (hangar / battle /
// ended, every 10 s and on each change). The site's overlay follows it — a
// battle shows the HUD, its end the bracket — with its own transitions, so
// OBS needs one scene only. Optionally it also switches OBS scenes. P pauses
// and resumes (the site's console can too). Node 22+, no dependencies. See
// README.md. The work is done by engine.mjs (the panel, panel.mjs, uses it
// too); this is its command line.

import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';
import { mergeOptions, toEngineConfig } from './config.mjs';
import { REPORT_NAMES, createEngine } from './engine.mjs';

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

const cfg = toEngineConfig(opt, {
  token: process.env.POTATO_ADMIN_TOKEN || fileConfig.adminToken || '',
  obsPassword: process.env.OBS_PASSWORD || fileConfig.obsPassword || '',
});
if (cfg.record) cfg.record = resolvePath(cfg.record);

let shown = { paused: false, reported: null };
// The window title shows what the script is doing.
function title(st) {
  const what = st.paused ? '已暂停（按 P 恢复）' : REPORT_NAMES[st.reported] || '等待游戏';
  if (process.stdout.isTTY) process.stdout.write(`\x1b]0;自动切换 · ${what}\x07`);
}

const engine = createEngine({
  onLog: ({ at, msg }) => console.log(new Date(at).toLocaleTimeString(), msg),
  onChange: (st) => {
    if (st.paused === shown.paused && st.reported === shown.reported) return;
    shown = st;
    title(st);
  },
});

try {
  engine.start(cfg);
} catch (e) {
  console.error(`${e.message}。--help 查看用法`);
  process.exit(1);
}
title(shown);

// P pauses / resumes; Ctrl+C quits.
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    const key = buf.toString();
    if (key === '\u0003') process.exit(0);
    if (key === 'p' || key === 'P') engine.setPaused(!engine.status().paused).catch(() => {});
  });
  console.log('按 P 暂停 / 恢复，Ctrl+C 退出');
}
