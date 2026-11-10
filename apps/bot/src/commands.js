// The official bot's commands (only on the QQ platform: the community bot
// never answers these). Who is asking comes from the openid QQ gives the
// bot (session.userId), bound to a player with "绑定 <code>".

import {
  HELP, NOT_BOUND, findPlayer, formatCheckedIn, formatOpenEvents, formatRegistered, formatSchedule, formatStats, pickEvent,
} from './format.js';

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

// "绑定123456", "报名1": a number typed straight after the command (no
// space) is common on phones; Koishi only matches "绑定 123456".
const GLUED = /^\/?(绑定|bind|报名|取消报名|签到)(\d{1,6})$/i;

/** The command with the space put back (and no "/"), or null when the text is not a glued command. */
export function unglue(text) {
  const m = String(text || '').trim().match(GLUED);
  return m ? `${m[1]} ${m[2]}` : null;
}

const failed = (err) => (err?.status && err.status < 500 ? err.message : '网站暂时连不上，请稍后再试。');

export function registerCommands(ctx, site, logger = console) {
  const qq = ctx.platform('qq');
  const mayBind = attemptLimiter();

  qq.middleware((session, next) => {
    const fixed = unglue(session.stripped?.content ?? session.content);
    return fixed ? session.execute(fixed) : next();
  }, true);

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

  // ---- Registration (the site's rules apply: lib/registration.js) ----

  qq.command('报名 [event:text]', '报名赛事').alias('register').action(async ({ session }, arg) => {
    try {
      const data = await site.openEvents(session.userId);
      if (!arg?.trim()) return formatOpenEvents(data);
      if (!data.player_id) return NOT_BOUND;
      const event = pickEvent(data.events, arg);
      if (!event) return `没有找到「${arg.trim()}」。发送「报名」查看正在报名的赛事和编号。`;
      if (event.registered) return `你已经报名了 ${event.name}。`;
      await site.register(session.userId, event.id);
      return formatRegistered(event);
    } catch (err) {
      logger.warn?.(`[commands] register failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  qq.command('取消报名 [event:text]', '退出报名').alias('withdraw').action(async ({ session }, arg) => {
    try {
      const data = await site.openEvents(session.userId);
      if (!data.player_id) return NOT_BOUND;
      const mine = (events) => {
        const registered = events.filter((e) => e.registered);
        return registered.length === 1 ? registered[0] : null;
      };
      const event = pickEvent(data.events, arg, mine);
      if (!event) return arg?.trim() ? `没有找到「${arg.trim()}」。` : '请发送「取消报名 编号」，编号见「报名」列表。';
      if (!event.registered) return `你没有报名 ${event.name}。`;
      await site.unregister(session.userId, event.id);
      return `已退出 ${event.name} 的报名。`;
    } catch (err) {
      return failed(err);
    }
  });

  qq.command('签到 [event:text]', '签到').alias('checkin').action(async ({ session }, arg) => {
    try {
      const data = await site.openEvents(session.userId);
      if (!data.player_id) return NOT_BOUND;
      const event = arg?.trim() ? pickEvent(data.events, arg) : null;
      if (arg?.trim() && !event) return `没有找到「${arg.trim()}」。`;
      const { checked_in: ids } = await site.checkin(session.userId, event?.id);
      const names = ids.map((id) => data.events.find((e) => e.id === id)?.name || id);
      return formatCheckedIn(names);
    } catch (err) {
      return failed(err);
    }
  });
}
