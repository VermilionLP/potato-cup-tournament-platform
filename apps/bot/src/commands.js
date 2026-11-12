// The official bot's commands (only on the QQ platform: the community bot
// never answers these). Who is asking comes from the openid QQ gives the
// bot (session.userId), bound to a player with "绑定 <code>".

import {
  HELP, NOT_BOUND, findPlayer, formatAchievements, formatAnswered, formatCheckedIn, formatHeadToHead, formatLadder, formatOpenEvents,
  formatPoints, formatRecap, formatRegistered, formatReported, formatSchedule, formatStats, formatTop, formatUnknown, parseScore, pickEvent,
  resolveLookup,
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
const GLUED = /^\/?(绑定|bind|报名|取消报名|签到|报分|report)(\d{1,6}|\d{1,2}\s*[:：\-－比]\s*\d{1,2})$/i;

/**
 * The command with the space put back (and no "/"), or null when the text
 * is not a glued command. Also "Top20" / "TOP 20" in any case (Koishi's
 * command names are lower case).
 */
export function unglue(text) {
  const t = String(text || '').trim();
  if (/^\/?top\s*20$/i.test(t) && t.replace(/^\//, '') !== 'top20') return 'top20';
  const m = t.match(GLUED);
  return m ? `${m[1]} ${m[2]}` : null;
}

const failed = (err) => (err?.status && err.status < 500 ? err.message : '网站暂时连不上，请稍后再试。');

/**
 * `pictures`: { cards, h } to answer 帮助 / 报名 / 赛程 / 战绩 with PNG cards
 * (src/cards.js); without it, or if drawing fails, the replies are text.
 */
export function registerCommands(ctx, site, logger = console, pictures = null) {
  const qq = ctx.platform('qq');
  // A card for the reply, or the text when there are no cards or drawing fails.
  async function picture(draw, fallback) {
    if (!pictures) return fallback();
    try {
      return pictures.h.image(await draw(pictures.cards), 'image/png');
    } catch (err) {
      logger.warn?.(`[commands] drawing a card failed, sending text: ${err?.message || err}`);
      return fallback();
    }
  }
  const mayBind = attemptLimiter();

  qq.middleware((session, next) => {
    const fixed = unglue(session.stripped?.content ?? session.content);
    return fixed ? session.execute(fixed) : next();
  }, true);

  qq.command('帮助', '查看指令').alias('help').action(() => picture((cards) => cards.help(), () => HELP));

  // A typed player name: exact, any case, an old name or one near match
  // (GET /players/lookup); otherwise the reply lists who they may mean.
  async function resolveName(name) {
    return resolveLookup(name, await site.lookup(name.trim()));
  }
  // "名字" or nothing (= me): { id, note } or { message }.
  async function playerOf(session, name) {
    if (name?.trim()) return resolveName(name.trim());
    const id = await site.whois(session.userId);
    return id ? { id } : { message: `${NOT_BOUND}\n也可以在指令后面加选手名查任意选手。` };
  }
  const withNote = (note, reply) => (note && typeof reply === 'string' ? `${note}\n${reply}` : reply);

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
      const data = await site.schedule(playerId);
      return picture((cards) => cards.schedule(data), () => formatSchedule(data));
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
      let player = findPlayer(stats.players, who);
      if (!player && name?.trim()) {
        const found = await resolveName(who);
        if (found.message) return found.message;
        player = findPlayer(stats.players, found.id);
        if (!player) return `${found.id} 还没有比赛记录。`;
      }
      if (!player) return `没有找到「${who}」的比赛记录。`;
      // The ladder adds league, MMR and recent form to the card; the card still works without it.
      const ladder = pictures ? await site.ladder(player.id).catch(() => null) : null;
      return picture((cards) => cards.stats(player, ladder), () => formatStats(player));
    } catch (err) {
      logger.warn?.(`[commands] stats failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  // ---- Registration (the site's rules apply: lib/registration.js) ----

  qq.command('报名 [event:text]', '报名赛事').alias('register').action(async ({ session }, arg) => {
    try {
      const data = await site.openEvents(session.userId);
      if (!arg?.trim()) return picture((cards) => cards.openEvents(data), () => formatOpenEvents(data));
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

  // ---- Results (the site's rules: lib/player-reports.js) ----

  qq.command('报分 <score:text>', '报比分（自己的在前）').alias('report').action(async ({ session }, arg) => {
    const score = parseScore(arg);
    if (!score) return '请发送「报分 2:1」，自己的比分在前（2:1 = 你赢 2 局、对手赢 1 局）。';
    try {
      const r = await site.report(session.userId, score.mine, score.theirs, score.event || undefined);
      return formatReported(r);
    } catch (err) {
      logger.warn?.(`[commands] report failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  qq.command('确认', '确认对手报的比分').alias('confirm').action(async ({ session }) => {
    try {
      return formatAnswered(await site.confirm(session.userId));
    } catch (err) {
      return failed(err);
    }
  });

  qq.command('有异议', '对对手报的比分提出异议').alias('异议').alias('dispute').action(async ({ session }) => {
    try {
      return formatAnswered(await site.dispute(session.userId));
    } catch (err) {
      return failed(err);
    }
  });

  // ---- Rankings and players ----

  qq.command('天梯', '天梯排行和我的名次').alias('ladder').action(async ({ session }) => {
    try {
      const [board, me] = await Promise.all([site.ladderBoard(), site.whois(session.userId)]);
      const players = board.players || [];
      const mine = me ? players.find((p) => p.id === me) || null : null;
      return picture((cards) => cards.ladder({ players, me: mine }), () => formatLadder(players, mine));
    } catch (err) {
      logger.warn?.(`[commands] ladder failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  qq.command('积分', '本赛季积分榜').alias('points').action(async ({ session }) => {
    try {
      const [data, me] = await Promise.all([site.points(), site.whois(session.userId)]);
      return picture((cards) => cards.points({ data, meId: me }), () => formatPoints(data, me));
    } catch (err) {
      logger.warn?.(`[commands] points failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  qq.command('top20', '年度 Top20').alias('top').alias('年度').action(async () => {
    try {
      const season = (await site.points()).season;
      const view = await site.seasonTop(season);
      return picture((cards) => cards.top({ season, view }), () => formatTop(season, view));
    } catch (err) {
      logger.warn?.(`[commands] top20 failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  qq.command('成就 [name:text]', '成就徽章').alias('badges').action(async ({ session }, name) => {
    try {
      const who = await playerOf(session, name);
      if (who.message) return who.message;
      const data = await site.achievements(who.id);
      const stats = await site.statistics().catch(() => null);
      const p = findPlayer(stats?.players, who.id);
      const player = { id: who.id, name: p?.display_name || who.id, flag: p?.flag || '' };
      return withNote(who.note, await picture((cards) => cards.achievements({ player, data }), () => formatAchievements(player.name, data)));
    } catch (err) {
      logger.warn?.(`[commands] achievements failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  qq.command('回顾 [name:text]', '赛季回顾').alias('recap').action(async ({ session }, name) => {
    try {
      const who = await playerOf(session, name);
      if (who.message) return who.message;
      const r = await site.seasonRecap(who.id);
      return withNote(who.note, await picture((cards) => cards.recap(r), () => formatRecap(r)));
    } catch (err) {
      logger.warn?.(`[commands] recap failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  // 交手 A B, or 交手 B (me against B).
  qq.command('交手 [names:text]', '交手记录').alias('vs').action(async ({ session }, arg) => {
    const names = String(arg || '').trim().split(/\s+/).filter(Boolean);
    if (!names.length || names.length > 2) return '请发送「交手 选手名」查你和他的交手记录，或「交手 A B」查两位选手。';
    try {
      const [first, second] = names.length === 2
        ? await Promise.all(names.map(resolveName))
        : [await playerOf(session, ''), await resolveName(names[0])];
      for (const r of [first, second]) if (r.message) return r.message;
      if (first.id === second.id) return '请填两位不同的选手。';
      const h = await site.headToHead(first.id, second.id);
      return withNote([first.note, second.note].filter(Boolean).join('\n'), await picture((cards) => cards.headToHead(h), () => formatHeadToHead(h)));
    } catch (err) {
      logger.warn?.(`[commands] vs failed: ${err?.message || err}`);
      return failed(err);
    }
  });

  // Anything else said to the bot: suggest the command it was probably
  // meant to be (the official bot only gets messages that @ it, or private ones).
  qq.middleware((session, next) => next(() => {
    const content = String(session.stripped?.content ?? session.content ?? '').trim();
    if (!content) return '在呢！发送「帮助」查看指令。';
    return formatUnknown(content);
  }));
}
