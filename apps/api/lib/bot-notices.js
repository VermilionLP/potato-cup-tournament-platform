// Notices for the QQ group, posted by the community bot (apps/bot). The
// site already decides who needs to hear what (lib/match-flow.js: match
// ready, score to confirm, ban turn; lib/bot-scheduler.js: the hour before
// an event); each of those also queues a row here. The bot fetches the
// unsent rows, posts them with an @ for every QQ number in `mentions`, and
// marks them sent.
//
// Nothing is queued unless BOT_TOKEN is set (no bot, no queue). A notice
// the bot did not fetch within NOTICE_TTL_MS is dropped instead of being
// posted late (a "your match is ready" from an hour ago only confuses).
// Texts are pure functions so they can be tested and read in one place;
// they carry no links (links in frequent messages draw QQ's risk checks).
//
// Keeping up on match days (the bot pauses a few seconds between messages):
// urgent notices go first (admin, score to confirm, ban turn, then match
// ready; results and announcements last), notices overtaken by events are
// dropped (the match was played, the score handled, a later ban turn came),
// and ready / result notices of one event are merged into one message
// (noticeBatches). When an event is marked finished, its final placings
// (lib/event-final-notice.js).

import { isBotConfigured } from './bot-auth.js';
import { parseContact } from './contact.js';
import { parseScheduledDateTime } from './calendar.js';

export const NOTICE_TTL_MS = 30 * 60 * 1000;
const MAX_MENTIONS = 40;

export function botNoticesEnabled() {
  return isBotConfigured();
}

const tag = (event) => `【${event || 'Potato Cup'}】`;

// Messages the official bot relays to a player in QQ (routes/bot.js errors).
export const BIND_MESSAGES = {
  badCode: '绑定码是 6 位数字',
  unknownCode: '绑定码无效或已过期，请在网站上重新获取',
};

/** "20:00" from a scheduled time, or a word when there is none. */
export function clockOf(parsed) {
  return parsed ? `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}` : '稍后';
}

export const resultLine = (a, s1, s2, b, winner) => `${a} ${s1} : ${s2} ${b}，${winner} 胜出`;
export const walkoverLine = (winner, loser) => `${winner} 不战而胜${loser ? `（${loser} 弃权）` : ''}`;

export const noticeText = {
  ready: (event, a, b) => `${tag(event)}比赛就绪：${a} vs ${b}\n请双方准备，房间信息以网站和裁判安排为准。打完后在群里 @土豆杯机器人 发送「报分 2:1」（自己的比分在前），或到网站填报。`,
  confirm: (event, a, s1, s2, b) => `${tag(event)}请确认比分：${a} ${s1} : ${s2} ${b}\n对手已提交。在群里 @土豆杯机器人 发送「确认」或「有异议」，也可以到网站处理；10 分钟内不处理将自动生效。`,
  ban: (event, who, before) => `${tag(event)}轮到 ${who} 禁用${before ? `（${before}）` : ''}\n请到网站的 Ban/Pick 里选择要禁用的大组。`,
  result: (event, a, s1, s2, b, winner) => `${tag(event)}赛果：${resultLine(a, s1, s2, b, winner)}`,
  walkover: (event, winner, loser) => `${tag(event)}赛果：${walkoverLine(winner, loser)}`,
  // Several at once (noticeBatches).
  readyMany: (event, pairs) => `${tag(event)}比赛就绪：\n${pairs.map(([a, b]) => `${a} vs ${b}`).join('\n')}\n请双方准备，房间信息以网站和裁判安排为准。打完后在群里 @土豆杯机器人 发送「报分 2:1」（自己的比分在前），或到网站填报。`,
  resultMany: (event, lines) => `${tag(event)}赛果：\n${lines.join('\n')}`,
  // podium: [{ from, place, name }] (places 1-3, best first).
  final: (event, podium) => {
    const title = (r) => (r.place === '1' ? '冠军' : r.place === '2' ? '亚军' : r.place === '3' ? '季军' : `第 ${r.place} 名`);
    const lines = [...new Set(podium.map((r) => r.place))].map((place) => {
      const same = podium.filter((r) => r.place === place);
      return `${title(same[0])} ${same.map((r) => r.name).join(' / ')}`;
    });
    return `${tag(event)}比赛结束！\n${lines.join('\n')}\n恭喜各位！完整排名和积分见网站赛事页。`;
  },
  open: (event, when, capacity, checkin) => `${tag(event)}开放报名！比赛时间 ${when}，名额 ${capacity} 人${checkin ? '，需要签到' : ''}。\n在群里 @土豆杯机器人 发送「报名」即可报名，也可以到网站报名。`,
  // The season's Top 20, one place a day (lib/season-top.js).
  topReveal: (season, rank, name, line) => `【${season} 年度 Top20】第 ${rank} 名：${name}${line ? `\n${line}` : ''}\n${rank > 1 ? '明天同一时间揭晓下一位。' : '年度 Top20 全部揭晓！'}完整名单在网站「排行 → 年度 Top20」。`,
  // A revealed player's season in one line (lib/player-awards.js buildSeasonRecap).
  topStats: (r) => [
    r.points ? `年度积分 ${r.points.total}` : '',
    `参赛 ${r.events} 场`,
    r.matches ? `${r.wins} 胜 ${r.losses} 负` : '',
    r.titles ? `冠军 ${r.titles} 次` : '',
  ].filter(Boolean).join(' · '),
  // Matches waiting for an admin (lib/admin-alerts.js).
  adminDispute: (event, a, b, reporter, first, disputer) => `${tag(event)}需要管理员处理：${a} vs ${b} 的结果有异议（${reporter} 报 ${first}，${disputer ? `${disputer} 不同意` : '对手不同意'}）\n请管理员到网站的比赛日控制台裁决。`,
  adminWalkover: (event, a, b, by) => `${tag(event)}需要管理员确认：${by} 在 ${a} vs ${b} 申报对手弃权\n请管理员到网站的比赛日控制台处理。`,
  soon: (event, time, checkin) => `${tag(event)}将在 ${time} 开始${checkin ? '，开赛前 30 分钟开放签到，请记得到网站签到' : ''}。`,
};

/** QQ numbers of these players (in their order, each once), from their contacts. */
export async function qqNumbersOf(db, playerIds) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return [];
  const rows = (await db.query(
    'SELECT id, battle_tags FROM axsuck.players WHERE id = ANY($1::text[])', [ids],
  )).rows;
  const byId = new Map(rows.map((r) => [r.id, parseContact(r.battle_tags).qq]));
  return [...new Set(ids.map((id) => byId.get(id)).filter(Boolean))];
}

/**
 * Queues one notice; `mention` = player ids to @ (those without a QQ number
 * are just named in the text). Returns the new row id, or null when the
 * bots are off. Never throws: a notice must not fail the request behind it.
 */
export async function queueBotNotice(db, { kind, tournamentId = null, text, mention = [], matchId = null, data = null }, log = console) {
  if (!botNoticesEnabled()) return null;
  try {
    const qq = (await qqNumbersOf(db, mention)).slice(0, MAX_MENTIONS);
    const { rows } = await db.query(
      `INSERT INTO axsuck.bot_notices (kind, tournament_id, text, mentions, match_id, data)
       VALUES ($1, $2, $3, $4::text[], $5, $6) RETURNING id`,
      [kind, tournamentId, text, qq, matchId, data ? JSON.stringify(data) : null],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    log.error?.({ err, kind, tournamentId }, 'queueing a bot notice failed');
    return null;
  }
}

/** "11月14日 20:00" from a scheduled time, or a word when there is none. */
export function dateOf(scheduledTime) {
  const p = parseScheduledDateTime(scheduledTime);
  if (!p) return '待定';
  return `${p.month}月${p.day}日${p.hasTime ? ` ${clockOf(p)}` : ''}`;
}

/** "Sign-ups are open" for a new event in registration. */
export function queueRegistrationOpen(db, event, log = console) {
  if (!event || event.status !== 'registration') return Promise.resolve(null);
  return queueBotNotice(db, {
    kind: 'open',
    tournamentId: event.id,
    text: noticeText.open(event.name, dateOf(event.scheduled_time), event.player_capacity, event.checkin_enabled),
  }, log);
}

// Replies of the bot's registration routes (routes/bot.js).
export const REGISTER_MESSAGES = {
  notBound: '你还没有绑定选手。请在网站右上角铃铛的「QQ 群提醒」里获取绑定码，然后 @我 发送「绑定 123456」。',
};

// The official bot's replies about results (routes/bot.js).
export const RESULT_MESSAGES = {
  noMatch: '你现在没有可以报分的比赛。',
  nothingToConfirm: '你现在没有等你确认的比分。',
  nothingToDispute: '你现在没有可以提出异议的结果。',
  several: (names) => `你同时有 ${names.length} 场比赛：${names.join('、')}，请到网站操作。`,
};

// Which notices go first: someone is waiting on these.
export const NOTICE_PRIORITY = { admin: 0, confirm: 1, ban: 1, ready: 2, soon: 2, result: 3, final: 3, open: 4, top: 4 };
// Ready / result notices of one event merged into one message, at most this many.
export const MERGE_MAX = 8;

/**
 * The messages to post, from unsent rows in posting order: ready and result
 * rows of the same event (with their `data`) become one message (up to
 * MERGE_MAX, the @s of all of them); the rest go one by one. Each batch
 * carries the row ids to mark sent. Pure.
 */
export function noticeBatches(rows) {
  const out = [];
  const open = new Map(); // "kind:tournament" -> batch still taking rows
  for (const r of rows) {
    const mergeable = (r.kind === 'ready' && r.data?.a) || (r.kind === 'result' && r.data?.line);
    const key = `${r.kind}:${r.tournament_id}`;
    const batch = mergeable ? open.get(key) : null;
    if (batch && batch.rows.length < MERGE_MAX && batch.mentions.length + (r.mentions?.length || 0) <= MAX_MENTIONS) {
      batch.rows.push(r);
      for (const qq of r.mentions || []) if (!batch.mentions.includes(qq)) batch.mentions.push(qq);
      continue;
    }
    const fresh = { kind: r.kind, tournament_id: r.tournament_id, rows: [r], mentions: [...(r.mentions || [])] };
    out.push(fresh);
    if (mergeable) open.set(key, fresh);
  }
  return out.map((b) => {
    const [first] = b.rows;
    let text = first.text;
    if (b.rows.length > 1 && b.kind === 'ready') text = noticeText.readyMany(first.data.event, b.rows.map((r) => [r.data.a, r.data.b]));
    if (b.rows.length > 1 && b.kind === 'result') text = noticeText.resultMany(first.data.event, b.rows.map((r) => r.data.line));
    const ids = b.rows.map((r) => Number(r.id));
    // The final placings travel along: the bot draws them as a picture.
    const data = b.kind === 'final' && first.data ? { data: first.data } : {};
    return { id: ids[0], ids, kind: b.kind, tournament_id: b.tournament_id, text, mentions: b.mentions, created_at: first.created_at, ...data };
  });
}

/**
 * Messages to post now (noticeBatches of the unsent rows not older than
 * NOTICE_TTL_MS, most urgent first). Drops old rows and ones overtaken by
 * events: a ready notice for a match that was played, a score to confirm
 * that was handled, a ban turn when the match is past it or a later turn
 * was announced.
 */
export async function pendingNotices(db, limit = 20) {
  await db.query(`
    DELETE FROM axsuck.bot_notices
    WHERE (sent_at IS NOT NULL AND sent_at < NOW() - INTERVAL '7 days')
       OR (sent_at IS NULL AND created_at < NOW() - INTERVAL '1 day')
  `);
  await db.query(`
    DELETE FROM axsuck.bot_notices n
    USING axsuck.matches m
    WHERE n.sent_at IS NULL AND n.match_id = m.id AND (
      (n.kind = 'ready' AND m.status <> 'pending')
      OR (n.kind = 'confirm' AND (m.status <> 'pending' OR m.pending_report IS NULL))
      OR (n.kind = 'ban' AND (
        m.status <> 'pending'
        OR COALESCE(m.banpick->'state'->>'phase', '') <> 'ban'
        OR EXISTS (SELECT 1 FROM axsuck.bot_notices later WHERE later.match_id = n.match_id AND later.kind = 'ban' AND later.id > n.id)
      ))
    )
  `);
  const { rows } = await db.query(`
    SELECT id, kind, tournament_id, text, mentions, data, created_at
    FROM axsuck.bot_notices
    WHERE sent_at IS NULL AND created_at > NOW() - ($1::int * INTERVAL '1 millisecond')
    ORDER BY CASE kind ${Object.entries(NOTICE_PRIORITY).map(([k, v]) => `WHEN '${k}' THEN ${v}`).join(' ')} ELSE 3 END, id
    LIMIT $2
  `, [NOTICE_TTL_MS, limit * MERGE_MAX]);
  return noticeBatches(rows.map((r) => ({ ...r, id: Number(r.id) }))).slice(0, limit);
}
