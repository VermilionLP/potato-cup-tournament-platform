// The official bot's commands (only on the QQ platform: the community bot
// never answers these). Who is asking comes from the openid QQ gives the
// bot (session.userId), bound to a player with "绑定 <code>".

import { HELP, NOT_BOUND, findPlayer, formatSchedule, formatStats } from './format.js';

/** At most `limit` tries per key in `windowMs` (binding codes are only 6 digits). */
export function attemptLimiter(limit = 5, windowMs = 10 * 60_000, now = () => Date.now()) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const recent = (hits.get(key) || []).filter((at) => t - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}

const failed = (err) => (err?.status && err.status < 500 ? err.message : '网站暂时连不上，请稍后再试。');

export function registerCommands(ctx, site, logger = console) {
  const qq = ctx.platform('qq');
  const mayBind = attemptLimiter();

  qq.command('帮助', '查看指令').alias('help').action(() => HELP);

  qq.command('绑定 <code:string>', '绑定选手').alias('bind').action(async ({ session }, code) => {
    if (!code) return '请发送「绑定 123456」，绑定码在网站右上角铃铛的「QQ 群提醒」里获取。';
    if (!mayBind(session.userId)) return '尝试次数太多，请 10 分钟后再试。';
    try {
      const { player_id: playerId } = await site.bind(String(code).trim(), session.userId);
      return `绑定成功：${playerId}。现在可以发送「赛程」或「战绩」查询。`;
    } catch (err) {
      logger.warn?.(`[commands] bind failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  qq.command('解绑', '解除绑定').alias('unbind').action(async ({ session }) => {
    try {
      const { removed } = await site.unbind(session.userId);
      return removed ? '已解除绑定。' : '你还没有绑定选手。';
    } catch (err) {
      return failed(err);
    }
  });

  qq.command('赛程', '我报名的比赛').alias('schedule').action(async ({ session }) => {
    try {
      const playerId = await site.whois(session.userId);
      if (!playerId) return NOT_BOUND;
      return formatSchedule(await site.schedule(playerId));
    } catch (err) {
      logger.warn?.(`[commands] schedule failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  qq.command('战绩 [name:text]', '查询战绩').alias('stats').action(async ({ session }, name) => {
    try {
      const who = name?.trim() || (await site.whois(session.userId));
      if (!who) return `${NOT_BOUND}\n也可以发送「战绩 选手名」查询任意选手。`;
      const stats = await site.statistics();
      return formatStats(findPlayer(stats.players, who)) || `没有找到「${who}」的比赛记录。`;
    } catch (err) {
      logger.warn?.(`[commands] stats failed: ${err?.message || err}`);
      return failed(err);
    }
  });
}
