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

import { isBotConfigured } from './bot-auth.js';
import { parseContact } from './contact.js';

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

export const noticeText = {
  ready: (event, a, b) => `${tag(event)}比赛就绪：${a} vs ${b}\n请双方准备，房间信息以网站和裁判安排为准。`,
  confirm: (event, a, s1, s2, b) => `${tag(event)}请确认比分：${a} ${s1} : ${s2} ${b}\n对手已提交，请到网站确认或提出异议；10 分钟内不处理将自动生效。`,
  ban: (event, who, before) => `${tag(event)}轮到 ${who} 禁用${before ? `（${before}）` : ''}\n请到网站的 Ban/Pick 里选择要禁用的大组。`,
  result: (event, a, s1, s2, b, winner) => `${tag(event)}赛果：${a} ${s1} : ${s2} ${b}，${winner} 胜出`,
  walkover: (event, winner, loser) => `${tag(event)}赛果：${winner} 不战而胜${loser ? `（${loser} 弃权）` : ''}`,
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
export async function queueBotNotice(db, { kind, tournamentId = null, text, mention = [] }, log = console) {
  if (!botNoticesEnabled()) return null;
  try {
    const qq = (await qqNumbersOf(db, mention)).slice(0, MAX_MENTIONS);
    const { rows } = await db.query(
      `INSERT INTO axsuck.bot_notices (kind, tournament_id, text, mentions)
       VALUES ($1, $2, $3, $4::text[]) RETURNING id`,
      [kind, tournamentId, text, qq],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    log.error?.({ err, kind, tournamentId }, 'queueing a bot notice failed');
    return null;
  }
}

/** Unsent notices not older than NOTICE_TTL_MS, oldest first. Drops old rows. */
export async function pendingNotices(db, limit = 20) {
  await db.query(`
    DELETE FROM axsuck.bot_notices
    WHERE (sent_at IS NOT NULL AND sent_at < NOW() - INTERVAL '7 days')
       OR (sent_at IS NULL AND created_at < NOW() - INTERVAL '1 day')
  `);
  const { rows } = await db.query(`
    SELECT id, kind, tournament_id, text, mentions, created_at
    FROM axsuck.bot_notices
    WHERE sent_at IS NULL AND created_at > NOW() - ($1::int * INTERVAL '1 millisecond')
    ORDER BY id
    LIMIT $2
  `, [NOTICE_TTL_MS, limit]);
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}
