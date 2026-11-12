// More picture replies for the official bot, in the same look as cards.js:
// 天梯 (ladder top and my place), 积分 (each points board's top and my
// place), Top20 (the season's revealed places), 成就 (badges), 交手 (two
// players' history) and 回顾 (a player's season). Each builds a Satori tree;
// cards.js renders them (createRenderer).

import {
  C, NO_ASSETS, TONES, box, card, cmd, empty, eventTitle, icon, iconTile, img, meta, nextUp, num, page, section, statTile, tag, text,
  whenText,
} from './cards.js';
import { POOL_NAMES, beijing } from './format.js';

const MEDAL = { 1: ['#fbbf24', '#78350f'], 2: ['#cbd5e1', '#1e293b'], 3: ['#fdba74', '#7c2d12'] };

/** The rank badge: gold, silver and bronze for the top three. */
function rankBadge(rank, size = 34) {
  const [bg, fg] = MEDAL[rank] || [C.soft, C.muted];
  return num({ width: size, height: size, borderRadius: 10, background: bg, color: fg, fontSize: Math.round(size * 0.55), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, rank);
}

const ellipsis = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' };

/** A player row of a board: rank, flag, name, extra, the value on the right. */
function boardRow({ rank, flag, name, extra = null, value, unit = '', me = false }, assets) {
  return box({
    alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 12,
    background: me ? C.orangeSoft : 'transparent', border: me ? '1px solid #fed7aa' : '1px solid transparent',
  }, [
    rankBadge(rank),
    img(assets.flag(flag), 26, 19, { borderRadius: 3, flexShrink: 0 }),
    box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0 }, [
      text({ fontSize: 17, fontWeight: 700, color: me ? C.orangeInk : C.ink, ...ellipsis }, name),
      extra,
    ]),
    box({ alignItems: 'baseline', gap: 4, flexShrink: 0 }, [
      num({ fontSize: 26, color: me ? C.orangeInk : C.ink, lineHeight: 1 }, value),
      unit ? text({ fontSize: 13, color: C.faint }, unit) : null,
    ]),
  ]);
}

const gap = () => box({ justifyContent: 'center', padding: '2px 0' }, [text({ fontSize: 16, color: C.faint, letterSpacing: 4 }, '···')]);

// ---- 天梯 ----

/** `players`: GET /ladder's players (rank order); `me`: the asking player's row or null. */
export function ladderCard({ players = [], me = null, n = 10 }, now, assets = NO_ASSETS) {
  const top = players.slice(0, n);
  const row = (p) => boardRow({
    rank: p.rank,
    flag: p.flag,
    name: p.display_name || p.id,
    extra: box({ alignItems: 'center', gap: 6, marginTop: 2 }, [
      p.tier?.group && p.tier.group !== 'unrated' ? img(assets.league(p.tier.group), 16, 16) : null,
      text({ fontSize: 13, color: C.muted }, `${p.tier?.name || '定级中'} · ${p.wins}胜${p.losses}负`),
    ]),
    value: p.mmr,
    unit: 'MMR',
    me: me && p.id === me.id,
  }, assets);
  const body = [];
  if (me) {
    body.push(box({ gap: 10 }, [
      statTile('trending-up', '我的名次', `#${me.rank}`, { sub: `/ ${players.length}` }),
      statTile('swords', 'MMR', me.mmr, { tone: 'info', sub: me.tier?.name || '' }),
    ]));
  }
  body.push(section('天梯排行', '最近一年活跃的选手'));
  if (!top.length) body.push(empty('天梯还没有排名', '打完一场比赛后就会出现在这里'));
  else {
    const rows = top.map(row);
    if (me && !top.some((p) => p.id === me.id)) rows.push(gap(), row(me));
    body.push(card({ flexDirection: 'column', gap: 2, padding: '10px 8px' }, rows));
  }
  body.push(nextUp([['战绩', '我的战绩和走势'], ['积分', '赛季积分榜']]));
  return page({ iconName: 'trending-up', title: '天梯排行', subtitle: `${players.length} 位选手 · 按 MMR 排序` }, body, now, assets);
}

// ---- 积分 ----

/** `data`: GET /points-leaderboard; `meId`: the asking player, or null. */
export function pointsCard({ data, meId = null, n = 5 }, now, assets = NO_ASSETS) {
  const boards = (data?.boards || []).filter((b) => b.players?.length);
  const idOf = (p) => p.id || p.player_id;
  const body = [];
  if (!boards.length) body.push(empty(`${data?.season || ''} 赛季还没有积分`, '赛事设置积分后，比完就会计入'));
  for (const b of boards) {
    const top = b.players.slice(0, n);
    const mine = meId ? b.players.find((p) => idOf(p) === meId) : null;
    const row = (p) => boardRow({
      rank: p.rank,
      flag: p.flag,
      name: p.display_name || idOf(p),
      extra: text({ fontSize: 13, color: C.muted, marginTop: 2 }, `${p.events ?? p.events_played ?? p.results?.length ?? '—'} 场计分`),
      value: p.total,
      unit: '分',
      me: mine && idOf(p) === meId,
    }, assets);
    const rows = top.map(row);
    if (mine && !top.some((p) => idOf(p) === meId)) rows.push(gap(), row(mine));
    body.push(section(POOL_NAMES[b.pool] || b.pool || '全部', `${b.players.length} 人`));
    body.push(card({ flexDirection: 'column', gap: 2, padding: '10px 8px' }, rows));
  }
  body.push(nextUp([['Top20', '年度 Top20'], ['回顾', '我的赛季回顾']]));
  return page({ iconName: 'award', title: `${data?.season || ''} 赛季积分`, subtitle: meId ? `选手 ${meId} 的名次已标出` : '各类型积分榜前几名' }, body, now, assets);
}

// ---- Top20 ----

const bjWhen = (iso) => whenText(beijing(iso));

/** `view`: GET /seasons/:season/top (revealed places carry a recap). */
export function topCard({ season, view }, now, assets = NO_ASSETS) {
  const body = [];
  const revealed = [...(view?.revealed || [])].sort((a, b) => a.rank - b.rank);
  if (!view?.size || !view.start_at) {
    body.push(empty(`${season} 年度 Top20 还没有公布`, '赛季结束后，从第 20 名开始每天揭晓一位，直到第 1 名'));
  } else {
    if (view.next || !view.started) {
      const at = view.next ? view.next.at : view.start_at;
      body.push(box({ alignItems: 'center', gap: 14, borderRadius: 18, border: `2px solid ${C.orange}`, background: '#fff7ed', padding: '14px 18px' }, [
        iconTile('hourglass', 46),
        box({ flexDirection: 'column', flexGrow: 1 }, [
          text({ fontSize: 20, fontWeight: 700 }, view.started ? `下一位：第 ${view.next.rank} 名` : '即将开始揭晓'),
          text({ fontSize: 14, color: C.muted, marginTop: 2 }, `${bjWhen(at)} 揭晓，群里会同步公布`),
        ]),
      ]));
    } else if (view.done) {
      body.push(card({ alignItems: 'center', gap: 12, background: '#fffbeb', border: '1px solid #fde68a' }, [
        iconTile('sparkles', 44, 'prize'),
        text({ fontSize: 18, fontWeight: 700 }, `${season} 年度 Top20 全部揭晓！`),
      ]));
    }
    const hidden = view.size - revealed.length;
    if (hidden > 0) {
      body.push(card({ alignItems: 'center', gap: 12, background: C.soft }, [
        icon('lock', 20, C.faint),
        text({ fontSize: 15, color: C.muted }, hidden === 1 ? '第 1 名 待揭晓' : `第 1 – ${hidden} 名 待揭晓`),
      ]));
    }
    body.push(...revealed.map((r) => {
      const s = r.recap || {};
      const line = [
        s.points?.total ? `年度积分 ${s.points.total}` : null,
        `参赛 ${s.events ?? 0} 场`,
        `${s.wins ?? 0} 胜 ${s.losses ?? 0} 负`,
        s.titles ? `冠军 ${s.titles} 次` : null,
      ].filter(Boolean).join(' · ');
      return card({ alignItems: 'center', gap: 14, padding: '12px 16px', border: MEDAL[r.rank] ? `1px solid ${MEDAL[r.rank][0]}` : `1px solid ${C.border}` }, [
        rankBadge(r.rank, 44),
        img(assets.flag(s.player?.flag), 30, 22, { borderRadius: 4, flexShrink: 0 }),
        box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0 }, [
          text({ fontSize: 20, fontWeight: 700, ...ellipsis }, s.player?.name || r.id),
          text({ fontSize: 13, color: C.muted, marginTop: 2 }, line),
        ]),
        r.rank === 1 ? icon('crown', 26, '#d97706') : null,
      ]);
    }));
  }
  body.push(nextUp([['积分', '赛季积分榜'], ['回顾 选手名', '某位选手的赛季']]));
  const sub = view?.size && view.start_at ? `已揭晓 ${revealed.length} / ${view.size} 名 · 每天揭晓一位` : '赛季结束后公布';
  return page({ iconName: 'crown', title: `${season} 年度 Top20`, subtitle: sub }, body, now, assets);
}

// ---- 成就 ----

const BADGE_ICON = {
  'first-title': ['trophy', 'prize'], 'three-titles': ['crown', 'prize'], 'major-title': ['star', 'special'], 'perfect-run': ['shield-check', 'success'],
  podiums: ['medal', 'brand'], 'events-10': ['flag', 'info'], 'events-30': ['landmark', 'info'], 'matches-50': ['swords', 'info'],
  'streak-5': ['flame', 'live'], 'streak-10': ['flame', 'live'], 'giant-killer': ['zap', 'special'], iron: ['calendar-check', 'success'],
};

/** `data`: GET /players/:id/achievements. */
export function achievementsCard({ player, data }, now, assets = NO_ASSETS) {
  const list = [...(data?.achievements || [])].sort((a, b) => Number(b.earned) - Number(a.earned) || b.value / b.target - a.value / a.target);
  const tile = (a) => {
    const [iconName, tone] = BADGE_ICON[a.id] || ['award', 'brand'];
    const [bg, fg] = TONES[tone] || TONES.brand;
    const share = Math.max(0, Math.min(1, a.value / a.target));
    return box({
      flexGrow: 1, flexBasis: 0, minWidth: 0, gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 16,
      background: a.earned ? C.card : C.soft, border: a.earned ? `1px solid ${C.border}` : `1px dashed ${C.border}`,
    }, [
      box({ width: 46, height: 46, borderRadius: 999, background: a.earned ? bg : '#e7e7e4', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [
        icon(iconName, 22, a.earned ? fg : '#a3a8b3'),
      ]),
      box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 3 }, [
        box({ alignItems: 'center', gap: 6 }, [
          text({ fontSize: 16, fontWeight: 700, color: a.earned ? C.ink : C.muted }, a.title),
          a.earned ? icon('check', 15, C.win) : null,
        ]),
        text({ fontSize: 12, color: C.muted, lineHeight: 1.35 }, a.desc),
        !a.earned && a.target > 1 ? box({ alignItems: 'center', gap: 8, marginTop: 2 }, [
          box({ height: 6, flexGrow: 1, borderRadius: 999, background: '#e2e2de' }, [
            box({ width: `${Math.round(share * 100)}%`, height: 6, borderRadius: 999, background: C.orange }, []),
          ]),
          num({ fontSize: 13, fontWeight: 600, color: C.muted }, `${a.value}/${a.target}`),
        ]) : null,
      ]),
    ]);
  };
  const side = box({ alignItems: 'baseline', gap: 4, flexShrink: 0 }, [
    num({ fontSize: 44, color: C.orangeInk, lineHeight: 1 }, data?.earned ?? 0),
    num({ fontSize: 20, color: C.faint }, `/ ${data?.total ?? list.length}`),
  ]);
  return page({
    iconName: null,
    title: player.name,
    titleLead: img(assets.flag(player.flag), 40, 30, { borderRadius: 5 }),
    subtitle: '成就徽章 · 灰色的还没拿到，下面是进度',
    side,
  }, [
    // Two per row (Satori's wrapping is unreliable with gaps).
    ...Array.from({ length: Math.ceil(list.length / 2) }, (_, i) => box({ gap: 10 }, [tile(list[2 * i]), list[2 * i + 1] ? tile(list[2 * i + 1]) : box({ flexGrow: 1, flexBasis: 0 }, [])])),
    nextUp([['战绩', '我的战绩'], ['回顾', '我的赛季回顾']]),
  ], now, assets);
}

// ---- 交手 ----

/** `h`: GET /players/:id/vs/:other. */
export function headToHeadCard(h, now, assets = NO_ASSETS) {
  const side = (p, series, games, right) => box({ flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start', flexGrow: 1, flexBasis: 0, gap: 6, minWidth: 0 }, [
    box({ alignItems: 'center', gap: 8, flexDirection: right ? 'row-reverse' : 'row', maxWidth: '100%' }, [
      img(assets.flag(p.flag), 32, 24, { borderRadius: 4, flexShrink: 0 }),
      text({ fontSize: 22, fontWeight: 700, ...ellipsis }, p.name),
    ]),
    text({ fontSize: 13, color: C.muted }, `小局 ${games}`),
  ]);
  const aLeads = h.series.a > h.series.b;
  const bLeads = h.series.b > h.series.a;
  const body = [
    card({ alignItems: 'center', gap: 16, padding: '20px 22px' }, [
      side(h.a, h.series.a, h.games.a, false),
      box({ alignItems: 'center', gap: 10, flexShrink: 0 }, [
        num({ fontSize: 58, color: aLeads ? C.orangeInk : C.ink, lineHeight: 1 }, h.series.a),
        num({ fontSize: 34, color: C.faint, lineHeight: 1 }, ':'),
        num({ fontSize: 58, color: bLeads ? C.orangeInk : C.ink, lineHeight: 1 }, h.series.b),
      ]),
      side(h.b, h.series.b, h.games.b, true),
    ]),
  ];
  if (!h.total) {
    body.push(empty('还没有在比赛中交过手', '只算已经结束的赛事'));
  } else {
    body.push(section('最近交手', h.total > h.meetings.length ? `共 ${h.total} 场，显示最近 ${h.meetings.length} 场` : `共 ${h.total} 场`));
    body.push(card({ flexDirection: 'column', gap: 0, padding: '6px 16px' }, h.meetings.map((m, i) => {
      const aWon = m.winner === h.a.id;
      return box({ alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${C.border}` : 'none' }, [
        box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0 }, [
          eventTitle(m.event.name, { fontSize: 19, ...ellipsis }),
          box({ alignItems: 'center', gap: 10, marginTop: 2 }, [
            meta('clock', whenText(beijing(m.event.date)).replace(/ \d{2}:\d{2}$/, '')),
            m.vehicle ? tag(m.vehicle, 'info') : null,
          ]),
        ]),
        m.walkover
          ? tag(`${aWon ? h.a.name : h.b.name} 不战而胜`, 'neutral')
          : box({ alignItems: 'center', gap: 6, flexShrink: 0 }, [
            num({ fontSize: 28, color: aWon ? C.win : C.muted, lineHeight: 1 }, m.score_a),
            num({ fontSize: 20, color: C.faint }, ':'),
            num({ fontSize: 28, color: aWon ? C.muted : C.win, lineHeight: 1 }, m.score_b),
          ]),
      ]);
    })));
    if (h.vehicles.length) {
      body.push(card({ alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px' }, [
        text({ fontSize: 14, fontWeight: 700, color: C.muted }, '常打的载具'),
        ...h.vehicles.map((v) => tag(`${v.name} ×${v.times}`, 'info')),
      ]));
    }
  }
  body.push(nextUp([['战绩 选手名', '某位选手的战绩'], ['交手 A B', '任意两位选手']]));
  return page({ iconName: 'swords', title: '交手记录', subtitle: `${h.a.name} vs ${h.b.name} · 已结束的赛事` }, body, now, assets);
}

// ---- 回顾 ----

const placeText = (b) => (b.to > b.place ? `第 ${b.place}-${b.to} 名` : `第 ${b.place} 名`);
const shortEvent = (name) => String(name || '').replace(/^(FamilyX\s+)?Potato Cup\s+/i, '');

/** `r`: GET /players/:id/season-recap. */
export function recapCard(r, now, assets = NO_ASSETS) {
  const rate = r.win_rate == null ? '—' : `${Math.round(r.win_rate * 100)}%`;
  const side = r.points?.total ? box({ flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }, [
    box({ alignItems: 'baseline', gap: 4 }, [num({ fontSize: 40, color: C.orangeInk, lineHeight: 1 }, r.points.total), text({ fontSize: 14, color: C.faint }, '分')]),
    text({ fontSize: 13, fontWeight: 700, color: C.muted }, `年度积分第 ${r.points.rank} 名 / ${r.points.of} 人`),
  ]) : null;
  const body = [];
  if (!r.events) {
    body.push(empty(`${r.season} 赛季还没有参赛记录`, '报名参加一场比赛吧', cmd('报名', { main: true })));
  } else {
    body.push(box({ gap: 10 }, [
      statTile('trophy', '参赛', r.events, { sub: r.podiums ? `${r.podiums} 次前三` : '场' }),
      statTile('swords', '战绩', `${r.wins}-${r.losses}`, { tone: 'info', sub: `胜率 ${rate}` }),
      statTile('crown', '冠军', r.titles, { tone: 'prize', color: r.titles ? C.prize : C.ink }),
    ]));
    body.push(box({ gap: 10 }, [
      statTile('flame', '最长连胜', r.best_streak, { tone: 'live', sub: '场' }),
      statTile('trending-up', '最高 MMR', r.peak_mmr ?? '—', { tone: 'info' }),
    ]));
    const titles = [...(r.title_events || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (titles.length) {
      body.push(section('冠军', `${titles.length} 次`));
      body.push(card({ flexWrap: 'wrap', gap: 8, padding: '14px 16px' }, titles.slice(0, 12).map((e) => box({
        alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a',
      }, [icon('trophy', 15, '#b45309'), text({ fontSize: 14, fontWeight: 700, color: '#92400e' }, shortEvent(e.name))])).concat(
        titles.length > 12 ? [text({ fontSize: 14, color: C.muted, alignSelf: 'center' }, `还有 ${titles.length - 12} 个`)] : [],
      )));
    }
    const rows = [
      r.best && !titles.length ? ['最佳成绩', `${placeText(r.best)} · ${shortEvent(r.best.event?.name)}`] : null,
      r.rival ? ['最常交手', `${r.rival.name} · ${r.rival.won} 胜 ${r.rival.played - r.rival.won} 负`] : null,
      r.vehicle ? ['最常用的载具', `${r.vehicle.name} · ${r.vehicle.times} 场`] : null,
    ].filter(Boolean);
    if (rows.length) {
      body.push(card({ flexDirection: 'column', gap: 0, padding: '4px 18px' }, rows.map(([label, value], i) => box({
        alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: i ? `1px solid ${C.border}` : 'none',
      }, [text({ fontSize: 15, fontWeight: 700, color: C.orangeInk, flexShrink: 0 }, label), text({ fontSize: 16, fontWeight: 700, ...ellipsis }, value)]))));
    }
  }
  body.push(nextUp([['成就', '我的成就徽章'], ['Top20', '年度 Top20']]));
  return page({
    iconName: null,
    title: r.player?.name || '',
    titleLead: img(assets.flag(r.player?.flag), 40, 30, { borderRadius: 5 }),
    subtitle: `${r.season} 赛季回顾`,
    side,
  }, body, now, assets);
}

