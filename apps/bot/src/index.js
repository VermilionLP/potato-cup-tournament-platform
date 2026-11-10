// Potato Cup QQ bots: one Koishi process that runs the official QQ bot
// (front desk, answers when @ed) and the community NapCat bot (announcer).
// Each adapter starts only when its credentials are in apps/bot/.env, so
// either bot can be brought up on its own. Both talk to the website only
// through its API; this process stores nothing.

import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.js';
import { allowSession } from './filters.js';
import { pingSite } from './site.js';

// Koishi's ESM build fails to load on Node 22 (@koishijs/loader), and the
// adapters require() the CommonJS build: load everything through require so
// the app and its adapters share one Koishi instance.
const require = createRequire(import.meta.url);
const { Context } = require('koishi');
const HttpService = require('@koishijs/plugin-http').default;
const QQAdapter = require('@koishijs/plugin-adapter-qq').default ?? require('@koishijs/plugin-adapter-qq');
const OneBotAdapter = require('koishi-plugin-adapter-onebot').default ?? require('koishi-plugin-adapter-onebot');

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env'), quiet: true });

const config = readConfig(process.env);
if (config.problems.length > 0) {
  for (const problem of config.problems) console.error(`[bot] ${problem}`);
  process.exit(1);
}

const app = new Context();
// ctx.http: both adapters wait for it (the Koishi CLI adds it; a bare app does not).
app.plugin(HttpService);

if (config.qq) {
  app.plugin(QQAdapter, {
    id: config.qq.appId,
    secret: config.qq.appSecret,
    type: 'private',
    sandbox: config.qq.sandbox,
    protocol: 'websocket',
  });
}

if (config.onebot) {
  app.plugin(OneBotAdapter, {
    selfId: config.onebot.selfId,
    token: config.onebot.token,
    protocol: 'ws',
    endpoint: config.onebot.endpoint,
  });
}

// Runs before every command: the community bot only works in the groups
// listed in ONEBOT_GROUPS and never answers private messages.
app.middleware((session, next) => (allowSession(session, config) ? next() : undefined), true);

// Setup check: proves the message path (QQ -> bot -> website -> QQ) works.
app.command('状态', '检查机器人和网站是否连通')
  .alias('status')
  .action(async ({ session }) => {
    const site = await pingSite(config.siteUrl);
    const who = session.platform === 'qq' ? '官方机器人' : '社区机器人';
    return `${who}在线。网站 API：${site.ok ? '正常' : `无法连接（${site.error}）`}`;
  });

await app.start();
console.log(`[bot] started: ${[config.qq && 'official QQ bot', config.onebot && 'community bot'].filter(Boolean).join(', ')}`);
