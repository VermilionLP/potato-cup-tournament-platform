// The official bot's replies, as plain text. Pure, so they can be tested.

const STATUS = { registration: '报名中', in_progress: '进行中' };

export const HELP = [
  '土豆杯机器人指令（@我 后发送，私聊也可以）：',
  '绑定 123456 — 绑定选手（绑定码在网站右上角铃铛「QQ 群提醒」里获取，同一个码 10 分钟内可在群里和私聊各绑定一次）',
  '报名 — 正在报名的赛事；报名 1 — 报名第 1 个',
  '取消报名 1 — 退出第 1 个赛事的报名',
  '签到 — 签到开放时一键签到',
  '赛程 — 我报名的比赛和现在要做的事',
  '报分 2:1 — 打完后报比分（自己的在前）',
  '确认 / 有异议 — 回应对手报的比分',
  '战绩 — 我的战绩；战绩 选手名 — 查别人',
  '交手 选手名 — 我和他的交手记录；交手 A B — 两位选手',
  '天梯 — 天梯排行和我的名次',
  '积分 — 本赛季积分榜和我的名次',
  'Top20 — 年度 Top20 已揭晓的名单',
  '成就 — 我的成就徽章；回顾 — 我的赛季回顾图',
  '解绑 — 解除绑定',
  '状态 — 检查机器人和网站是否在线',
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

/** Reply after registering. */
export function formatRegistered(e) {
  const when = shortTime(e.scheduled_time);
  return `报名成功：${e.name}（${when}）。${e.checkin_enabled ? '这场需要签到：开赛前 30 分钟 @我 发送「签到」。' : ''}`;
}

/** Reply after 签到: the events checked in to, by name. */
export function formatCheckedIn(names) {
  return names.length
    ? `签到成功：${names.join('、')}。`
    : '现在没有可以签到的比赛。签到在开赛前 30 分钟开放，只有报名了需要签到的赛事才要签到。';
}

// ---- Results ----

/**
 * "2:1", "2-1", "2：1", "2比1", "2 1" → { mine, theirs }, or null. The
 * player's own score comes first.
 */
export function parseScore(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})\s*(?:[:：\-－比]|\s)\s*(\d{1,2})(?:\s+(.+))?$/);
  if (!m) return null;
  return { mine: Number(m[1]), theirs: Number(m[2]), event: m[3]?.trim() || '' };
}

/** Reply after 报分 (POST /bot/report). */
export function formatReported(r) {
  const head = `${r.tournament}：${r.me} ${r.mine} : ${r.theirs} ${r.opponent}`;
  if (r.result === 'confirmed') return `${head}\n对手报的比分和你一致，比分已生效。`;
  if (r.result === 'disputed') return `${head}\n和对手报的比分不一致，已交给管理员处理。`;
  return `${head}\n已提交，等 ${r.opponent} 确认（对手 @我 发送「确认」或「有异议」）；10 分钟内没人处理会自动生效。`;
}

/** Reply after 确认 / 有异议 (POST /bot/confirm, /bot/dispute). */
export function formatAnswered(r) {
  const score = r.report ? `${r.report.mine} : ${r.report.theirs}` : '';
  return r.result === 'confirmed'
    ? `${r.tournament}：${r.me} ${score} ${r.opponent}，比分已生效。`
    : `${r.tournament}：已对 ${r.opponent} 报的比分提出异议，管理员会尽快处理。`;
}

// ---- Rankings and players ----

const rankLine = (p, value) => `${p.rank}. ${p.display_name || p.name || p.id} — ${value}`;

/** Reply to 天梯 (GET /ladder): the top and the asking player. */
export function formatLadder(players, me = null, n = 10) {
  if (!players?.length) return '天梯还没有排名。';
  const lines = ['天梯排行（最近一年活跃的选手）', ...players.slice(0, n).map((p) => rankLine(p, `${p.mmr} MMR · ${p.tier?.name || ''}`))];
  if (me && !players.slice(0, n).some((p) => p.id === me.id)) lines.push('…', rankLine(me, `${me.mmr} MMR · ${me.tier?.name || ''}`));
  return lines.join('\n');
}

/** Reply to 积分 (GET /points-leaderboard): each board's top and the player's place. */
export function formatPoints(data, meId = null, n = 5) {
  const boards = (data?.boards || []).filter((b) => b.players?.length);
  if (!boards.length) return `${data?.season || ''} 赛季还没有积分。`;
  const lines = [`${data.season} 赛季积分榜`];
  for (const b of boards) {
    lines.push(`【${POOL_NAMES[b.pool] || b.pool || '全部'}】`);
    lines.push(...b.players.slice(0, n).map((p) => rankLine(p, `${p.total} 分`)));
    const mine = meId ? b.players.find((p) => (p.id || p.player_id) === meId) : null;
    if (mine && mine.rank > n) lines.push('…', rankLine(mine, `${mine.total} 分`));
  }
  return lines.join('\n');
}

export const POOL_NAMES = { prop: '螺旋桨', 'legacy-jet': '早期喷气', 'top-jet': '顶级喷气', proleague: 'Pro League BVR' };

/** Reply to Top20 (GET /seasons/:season/top). */
export function formatTop(season, view) {
  if (!view?.size || !view.start_at) return `${season} 年度 Top20 还没有公布。赛季结束后从第 20 名开始每天揭晓一位。`;
  if (!view.revealed?.length) return `${season} 年度 Top20 将于 ${shortTime(beijing(view.start_at))} 开始揭晓。`;
  const lines = [`${season} 年度 Top20（已揭晓 ${view.revealed.length} / ${view.size}）`];
  for (const r of [...view.revealed].sort((a, b) => a.rank - b.rank)) lines.push(`${r.rank}. ${r.recap?.player?.name || r.id}`);
  if (view.next) lines.push(`下一位（第 ${view.next.rank} 名）：${shortTime(beijing(view.next.at))}`);
  return lines.join('\n');
}

/** "2026-11-14T20:00" in Beijing time from an ISO moment. */
export function beijing(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 8 * 3600_000);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Reply to 成就 (GET /players/:id/achievements). */
export function formatAchievements(name, data) {
  const list = data?.achievements || [];
  const got = list.filter((a) => a.earned).map((a) => a.title);
  const next = list.filter((a) => !a.earned).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 3);
  return [
    `${name} 的成就：${data?.earned || 0} / ${data?.total || list.length}`,
    got.length ? `已获得：${got.join('、')}` : '还没有获得成就',
    ...(next.length ? ['最接近的：', ...next.map((a) => `· ${a.title}（${a.value}/${a.target}）${a.desc}`)] : []),
  ].join('\n');
}

/** Reply to 交手 (GET /players/:id/vs/:other). */
export function formatHeadToHead(h) {
  if (!h?.total) return `${h?.a?.name} 和 ${h?.b?.name} 还没有在比赛中交过手。`;
  const lines = [
    `${h.a.name} vs ${h.b.name}`,
    `比赛 ${h.series.a} : ${h.series.b} · 小局 ${h.games.a} : ${h.games.b}`,
    '最近交手：',
    ...h.meetings.slice(0, 5).map((m) => `· ${m.event.name} — ${m.walkover ? `${m.winner === h.a.id ? h.a.name : h.b.name} 不战而胜` : `${m.score_a} : ${m.score_b}`}${m.vehicle ? ` · ${m.vehicle}` : ''}`),
  ];
  return lines.join('\n');
}

/** Reply to 回顾 (GET /players/:id/season-recap). */
export function formatRecap(r) {
  if (!r?.events) return `${r?.player?.name || ''} 在 ${r?.season || ''} 赛季还没有参赛记录。`;
  const rate = r.win_rate == null ? '—' : `${Math.round(r.win_rate * 100)}%`;
  return [
    `${r.player.name} 的 ${r.season} 赛季`,
    r.points?.total ? `年度积分 ${r.points.total}（第 ${r.points.rank} 名 / ${r.points.of} 人）` : null,
    `参赛 ${r.events} 场 · ${r.wins} 胜 ${r.losses} 负 · 胜率 ${rate}`,
    `冠军 ${r.titles} 次 · 领奖台 ${r.podiums} 次 · 最长 ${r.best_streak} 连胜${r.peak_mmr ? ` · 最高 MMR ${r.peak_mmr}` : ''}`,
    r.rival ? `最常交手：${r.rival.name}（${r.rival.won} 胜 ${r.rival.played - r.rival.won} 负）` : null,
  ].filter(Boolean).join('\n');
}

// ---- Being forgiving ----

/**
 * Who a typed name means, from GET /players/lookup: { id } when it is clear
 * (exact, an old name, or one near match), else { message } listing the
 * candidates.
 */
export function resolveLookup(name, res) {
  if (res?.exact) return { id: res.exact.id };
  if (res?.alias?.player) return { id: res.alias.player.id, note: `「${res.alias.alias}」已改名为「${res.alias.player.id}」` };
  const similar = res?.similar || [];
  const sameButCase = similar.filter((p) => p.id.toLowerCase() === String(name).trim().toLowerCase());
  if (sameButCase.length === 1) return { id: sameButCase[0].id };
  if (similar.length === 1) return { id: similar[0].id, note: `按「${similar[0].id}」查询` };
  if (similar.length) return { message: `没有找到「${name}」。你是不是要找：${similar.slice(0, 5).map((p) => p.id).join('、')}？` };
  return { message: `没有找到选手「${name}」。` };
}

// Commands the bot knows, for "did you mean" (Chinese and English names).
export const COMMAND_NAMES = [
  '帮助', '绑定', '解绑', '报名', '取消报名', '签到', '赛程', '报分', '确认', '有异议', '战绩', '交手', '天梯', '积分', 'Top20', '成就', '回顾', '状态',
  'help', 'bind', 'unbind', 'register', 'withdraw', 'checkin', 'schedule', 'report', 'confirm', 'dispute', 'stats', 'vs', 'ladder', 'points', 'top', 'badges', 'recap', 'status',
];

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/**
 * The command someone probably meant by `text` (its first word), or null:
 * one edit away for short words ("报命" → 报名), two for longer ones.
 */
export function suggestCommand(text) {
  const word = String(text || '').trim().replace(/^\//, '').split(/\s+/)[0].toLowerCase();
  if (!word) return null;
  let best = null;
  for (const name of COMMAND_NAMES) {
    const n = name.toLowerCase();
    const edits = distance(word, n);
    const limit = n.length <= 3 ? 1 : 2;
    if (edits > limit || edits >= word.length) continue;
    // Ties go to the command starting the same way ("确定" → 确认, not 绑定).
    const d = edits - (word[0] === n[0] ? 0.5 : 0);
    if (!best || d < best.d) best = { name, d };
  }
  return best?.name || null;
}

/** Reply to a message that is not a command. */
export function formatUnknown(text) {
  const guess = suggestCommand(text);
  return guess
    ? `没有这个指令。你是不是想发「${guess}」？发送「帮助」查看全部指令。`
    : '没听懂。发送「帮助」查看全部指令。';
}
