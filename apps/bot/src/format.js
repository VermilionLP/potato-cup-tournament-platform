// The official bot's replies, as plain text. Pure, so they can be tested.

const STATUS = { registration: '报名中', in_progress: '进行中' };

export const HELP = [
  '土豆杯机器人指令（@我 后发送）：',
  '绑定 123456 — 绑定选手（绑定码在网站右上角铃铛「QQ 群提醒」里获取）',
  '报名 — 正在报名的赛事；报名 1 — 报名第 1 个',
  '取消报名 1 — 退出第 1 个赛事的报名',
  '签到 — 签到开放时一键签到',
  '赛程 — 我报名的比赛和现在要做的事',
  '战绩 — 我的战绩；战绩 选手名 — 查别人',
  '解绑 — 解除绑定',
  '状态 — 检查机器人和网站是否在线',
  '',
  'Discord 服务器：网站首页点「加入 Discord」',
].join('\n');

export const NOT_BOUND = '你还没有绑定选手。请在网站右上角铃铛的「QQ 群提醒」里获取绑定码，然后 @我 发送「绑定 123456」。';

/** "11-14 20:00" from "2026-11-14T20:00" (Beijing time, as the site stores it). */
export function shortTime(scheduled) {
  const m = String(scheduled || '').match(/^\d{4}-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (!m) return '时间待定';
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(m[1])}-${pad(m[2])}${m[3] ? ` ${pad(m[3])}:${m[4]}` : ''}`;
}

const NOW = {
  confirm: (i) => `请确认与 ${i.opponent} 的比分（${i.score?.[0] ?? '?'} : ${i.score?.[1] ?? '?'}）`,
  ban: (i) => `轮到你禁用（对手 ${i.opponent}）`,
  ready: (i) => `可以开打：对手 ${i.opponent}`,
};

/** Reply to 赛程 from GET /bot/players/:id/schedule. */
export function formatSchedule(s) {
  if (!s?.events?.length) return `${s?.player_id ?? ''}：没有报名未结束的比赛。`;
  const lines = [`${s.player_id} 的赛程`];
  for (const e of s.events) {
    let line = `· ${e.name} — ${shortTime(e.scheduled_time)} · ${STATUS[e.status] || e.status}`;
    if (e.status === 'registration' && e.checkin_enabled) line += e.checked_in ? ' · 已签到' : ' · 需签到';
    lines.push(line);
  }
  if (s.now?.length) {
    lines.push('现在：');
    for (const i of s.now) lines.push(`· ${i.tournament}：${(NOW[i.kind] || (() => i.kind))(i)}`);
  }
  return lines.join('\n');
}

const pct = (won, lost) => (won + lost ? `${Math.round((won / (won + lost)) * 100)}%` : '—');

/** Reply to 战绩 from one entry of GET /players/statistics. */
export function formatStats(p) {
  if (!p) return null;
  const won = p.matches_won || 0;
  const lost = p.matches_lost || 0;
  return [
    `${p.display_name || p.id} 的战绩`,
    `参赛 ${p.tournaments_played || 0} 次 · ${won} 胜 ${lost} 负（胜率 ${pct(won, lost)}）`,
    `小局 ${p.maps_won || 0} : ${p.maps_lost || 0} · 冠军 ${p.championships || 0} · 亚军 ${p.runner_ups || 0}`,
  ].join('\n');
}

/** The statistics entry for a name: exact id first, then ignoring case. */
export function findPlayer(players, name) {
  const want = String(name || '').trim();
  if (!want || !Array.isArray(players)) return null;
  return players.find((p) => p.id === want)
    || players.find((p) => p.id.toLowerCase() === want.toLowerCase() || String(p.display_name || '').toLowerCase() === want.toLowerCase())
    || null;
}

/** "11-14 20:00 · 12/32 人" plus the player's own state. */
function eventLine(e, i) {
  let line = `${i + 1}. ${e.name} — ${shortTime(e.scheduled_time)} · ${e.player_count}/${e.player_capacity} 人`;
  if (e.registered) line += e.checkin_enabled ? (e.checked_in ? ' · 已报名，已签到' : ' · 已报名') : ' · 已报名';
  else if (e.player_count >= e.player_capacity) line += ' · 已满';
  return line;
}

/** Reply to 报名 without a number, from GET /bot/open-events. */
export function formatOpenEvents(data) {
  const events = data?.events || [];
  if (!events.length) return '目前没有正在报名的赛事。';
  const lines = ['正在报名的赛事：', ...events.map(eventLine)];
  const open = events.findIndex((e) => !e.registered && e.player_count < e.player_capacity);
  if (!data.player_id) lines.push('', NOT_BOUND);
  else if (open >= 0) lines.push('', `发送「报名 ${open + 1}」报名，「取消报名 编号」退出。`);
  else lines.push('', '发送「取消报名 编号」可以退出报名。');
  return lines.join('\n');
}

/**
 * The event a player means: its number in the list (1-based), its id, or
 * its exact name. With no argument, `fallback` picks (e.g. the only event
 * they are in). Returns the event or null.
 */
export function pickEvent(events, arg, fallback = null) {
  const want = String(arg ?? '').trim();
  if (!want) return fallback ? fallback(events) : null;
  if (/^\d{1,3}$/.test(want)) return events[Number(want) - 1] || null;
  return events.find((e) => e.id === want) || events.find((e) => e.name === want) || null;
}

/**
 * The Potato Cup Discord server (also on the site). Only the picture cards
 * show the link: the official QQ bot's text messages may only carry URLs
 * registered on the QQ platform, and an unregistered one can get the whole
 * reply blocked.
 */
export const DISCORD_INVITE = 'https://discord.gg/3KchNdgePr';

/** Reply after registering: the result, check-in if needed, then the Discord server (no link, see above). */
export function formatRegistered(e) {
  const when = shortTime(e.scheduled_time);
  return [
    `报名成功：${e.name}（${when}）。${e.checkin_enabled ? '这场需要签到：开赛前 30 分钟 @我 发送「签到」。' : ''}`,
    '下一步：加入 Potato Cup Discord 服务器，赛事通知、约战和找管理员都在里面。邀请链接见网站首页的「加入 Discord」，或 @我 发送「帮助」。',
  ].join('\n');
}

/** Reply after 签到: the events checked in to, by name. */
export function formatCheckedIn(names) {
  return names.length
    ? `签到成功：${names.join('、')}。`
    : '现在没有可以签到的比赛。签到在开赛前 30 分钟开放，只有报名了需要签到的赛事才要签到。';
}
