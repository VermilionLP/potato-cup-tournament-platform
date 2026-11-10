/** QQ gateway intent: GROUP_AT_MESSAGE_CREATE + C2C_MESSAGE_CREATE. */
export const QQ_USER_MESSAGE = 1 << 25;

// Reads the bot settings from environment variables (apps/bot/.env). Pure,
// so it can be tested without starting Koishi.

/**
 * @returns {{ qq: object|null, onebot: object|null, siteUrl: string, problems: string[] }}
 * `problems` lists what stops the process from starting.
 */
export function readConfig(env) {
  const problems = [];

  let qq = null;
  if (env.QQ_APP_ID || env.QQ_APP_SECRET) {
    if (!env.QQ_APP_ID || !env.QQ_APP_SECRET) {
      problems.push('QQ_APP_ID and QQ_APP_SECRET must be set together (official QQ bot).');
    } else {
      qq = {
        appId: env.QQ_APP_ID.trim(),
        appSecret: env.QQ_APP_SECRET.trim(),
        // The new QQ bot console (q.qq.com, 2026) has no sandbox: an
        // unpublished bot is limited by its 服务范围 instead.
        sandbox: env.QQ_SANDBOX === 'true',
        // Events to receive. Default USER_MESSAGE (1 << 25): group messages
        // that @ the bot and private (C2C) messages. Without intents the
        // gateway answers "invalid intents".
        intents: Number(env.QQ_INTENTS) || QQ_USER_MESSAGE,
      };
    }
  }

  let onebot = null;
  if (env.ONEBOT_SELF_ID || env.ONEBOT_TOKEN) {
    if (!/^\d{5,12}$/.test(env.ONEBOT_SELF_ID || '')) {
      problems.push('ONEBOT_SELF_ID must be the community bot account\'s QQ number.');
    } else if (!env.ONEBOT_TOKEN) {
      problems.push('ONEBOT_TOKEN is required (the token set on NapCat\'s WebSocket server).');
    } else {
      const groups = (env.ONEBOT_GROUPS || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (groups.length === 0) problems.push('ONEBOT_GROUPS must list at least one group number.');
      const noticeGroup = (env.ONEBOT_NOTICE_GROUP || groups[0] || '').trim();
      if (noticeGroup && !groups.includes(noticeGroup)) problems.push('ONEBOT_NOTICE_GROUP must be one of ONEBOT_GROUPS.');
      onebot = {
        noticeGroup,
        selfId: env.ONEBOT_SELF_ID,
        token: env.ONEBOT_TOKEN,
        endpoint: env.ONEBOT_ENDPOINT || 'ws://127.0.0.1:3001',
        groups: new Set(groups),
      };
    }
  }

  if (!qq && !onebot && problems.length === 0) {
    problems.push('No bot is configured: fill in apps/bot/.env (see .env.example).');
  }

  // BOT_TOKEN opens the site's /api/bot routes: notices for the community
  // bot, bindings and schedules for the official bot. Without it only the
  // 状态 check works.
  const botToken = (env.BOT_TOKEN || '').trim() || null;

  return { qq, onebot, botToken, siteUrl: (env.SITE_API_URL || 'http://127.0.0.1:3100').replace(/\/+$/, ''), problems };
}
