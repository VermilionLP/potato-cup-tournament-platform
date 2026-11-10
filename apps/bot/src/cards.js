// Picture replies for the official bot: 赛程, 报名 and 战绩 as PNG cards in
// the site's look: dark header with the logo and slanted orange stripes,
// brand orange, HarmonyOS Sans SC for text and Barlow Condensed for numbers
// (as the site's font-display), calendar date tiles, nation flags and the
// ladder's league icons from apps/web/static.
//
// Layout: Satori (flexbox -> SVG, text turned into outlines) then resvg
// (SVG -> PNG at 2x). HarmonyOS ships as ~80 woff2 files per weight split by
// unicode-range: for each card only the files covering its characters are
// decompressed (wawoff2, cached), each under its own family name, all
// listed in font-family so a character missing from one file is taken from
// the next. (resvg's own font loading rejects these split files and
// silently falls back to system fonts, which the server does not have.)

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import wawoff from 'wawoff2';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 720;
const C = {
  page: '#f4f4f1', card: '#ffffff', ink: '#14161b', muted: '#5b6170', faint: '#8b95a5', border: '#e7e7e3', soft: '#f1f1ee',
  header: '#0b0d12', header2: '#1d2430', orange: '#f97316', orangeDeep: '#ea580c', orangeInk: '#c2410c', orangeSoft: '#fff1e6',
  win: '#16a34a', winSoft: '#dcfce7', loss: '#e11d48', lossSoft: '#ffe4e6', prize: '#d97706',
};
const WEIGHTS = { 400: 'Regular', 700: 'Bold' };
const DISPLAY = 'DISPLAY'; // replaced by Barlow Condensed + the HarmonyOS list

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

function defaultFontDir() {
  // The package exports only its CSS (dist/index.css); the woff2 files sit next to it.
  return dirname(require.resolve('harmonyos-sans-sc-webfont-splitted'));
}

function parseRanges(css) {
  return [...css.matchAll(/url\("\.\/([^"]+\.woff2)"\)[^}]*?unicode-range:([^;}]+)/g)].map((m) => ({
    file: m[1],
    ranges: m[2].split(',').map((r) => r.trim().replace(/^U\+/i, '')).map((r) => {
      const [a, b] = r.split('-');
      return [parseInt(a, 16), parseInt(b || a, 16)];
    }),
  }));
}

/** Every string in a Satori tree (to pick the font files it needs). */
function textOf(node) {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
}

/** The tree with every DISPLAY font family replaced. */
function withFamilies(node, body, display) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => withFamilies(n, body, display));
  const style = node.props?.style;
  const fontFamily = style?.fontFamily === DISPLAY ? display : style?.fontFamily;
  return {
    ...node,
    props: {
      ...node.props,
      ...(style ? { style: { ...style, ...(fontFamily ? { fontFamily } : {}) } } : {}),
      children: withFamilies(node.props?.children, body, display),
    },
  };
}

// Cards built without the site's pictures (tests) just leave them out.
const NO_ASSETS = { logo: () => null, flag: () => null, league: () => null };

const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

export function createRenderer({
  fontDir = defaultFontDir(),
  staticDir = join(here, '..', '..', 'web', 'static'),
} = {}) {
  const sets = Object.fromEntries(Object.entries(WEIGHTS).map(([w, name]) => [w, parseRanges(readFileSync(join(fontDir, `${name}.css`), 'utf8'))]));
  const ttf = new Map(); // woff2 file -> decompressed font
  const barlowDir = join(dirname(require.resolve('@fontsource/barlow-condensed')), 'files');
  const barlow = [600, 700].map((weight) => ({
    name: 'Barlow Condensed',
    data: readFileSync(join(barlowDir, `barlow-condensed-latin-${weight}-normal.woff`)),
    weight,
    style: 'normal',
  }));

  // Pictures from the site (logo, flags, league icons), cached as data URIs.
  const files = new Map();
  const asset = (path, type) => {
    if (!files.has(path)) {
      const full = join(staticDir, path);
      files.set(path, existsSync(full) ? `data:${type};base64,${readFileSync(full).toString('base64')}` : null);
    }
    return files.get(path);
  };
  const assets = {
    logo: () => asset('Potato_Cup_2026_icon_darkmode.png', 'image/png'),
    flag: (code) => (/^[a-z]{2}(-[a-z]+)?$/.test(String(code || '')) ? asset(`flags/${code}.svg`, 'image/svg+xml') : null),
    league: (group) => (/^[a-z]+$/.test(String(group || '')) ? asset(`sc2-icons/league/${group}.svg`, 'image/svg+xml') : null),
  };

  async function fontsFor(text) {
    const cps = [...new Set([...text].map((c) => c.codePointAt(0)))];
    const fonts = [];
    for (const [weight, list] of Object.entries(sets)) {
      for (const f of list) {
        if (!cps.some((cp) => f.ranges.some(([a, b]) => cp >= a && cp <= b))) continue;
        if (!ttf.has(f.file)) ttf.set(f.file, Buffer.from(await wawoff.decompress(readFileSync(join(fontDir, f.file)))));
        fonts.push({ name: `hm-${f.file.replace(/\.woff2$/, '')}`, data: ttf.get(f.file), weight: Number(weight), style: 'normal' });
      }
    }
    return fonts;
  }

  /** PNG of a card tree, 2x for sharp text on phones. */
  async function render(tree) {
    const hm = await fontsFor(textOf(tree));
    const body = hm.map((f) => f.name).join(', ');
    const root = withFamilies(tree, body, `Barlow Condensed, ${body}`);
    root.props.style = { ...root.props.style, fontFamily: body };
    const svg = await satori(root, { width: WIDTH, fonts: [...barlow, ...hm] });
    return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH * 2 }, font: { loadSystemFonts: false } }).render().asPng();
  }

  return {
    render,
    schedule: (data, now) => render(scheduleCard(data, now, assets)),
    openEvents: (data, now) => render(openEventsCard(data, now, assets)),
    stats: (player, ladder, now) => render(statsCard(player, ladder, now, assets)),
  };
}

// ---- Building blocks ----

const el = (type, style, children) => ({ type, props: { style, children } });
const box = (style, children) => el('div', { display: 'flex', ...style }, children);
const text = (style, value) => el('div', { display: 'flex', ...style }, String(value));
const num = (style, value) => text({ fontFamily: DISPLAY, fontWeight: 700, ...style }, value);
const img = (src, width, height, style = {}) => (src ? { type: 'img', props: { src, width, height, style } } : null);

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** { month, day, weekday, time } from "2026-11-14T20:00" (Beijing time, as the site stores it), or null. */
export function dateParts(scheduled) {
  const m = String(scheduled || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return {
    month: mo,
    day: d,
    weekday: WEEK[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()],
    time: m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : '',
  };
}

/** "11月10日 12:20" in Beijing time, for the header. */
function stamp(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600_000);
  const pad = (v) => String(v).padStart(2, '0');
  return `${bj.getUTCMonth() + 1}/${bj.getUTCDate()} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`;
}

// The overlay's stinger look: two slanted orange bars at the right edge,
// in the 112 px the header content keeps clear of.
const STRIPES = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="260" viewBox="0 0 120 260">
<polygon points="72,0 104,0 52,260 20,260" fill="${C.orange}"/>
<polygon points="114,0 126,0 74,260 62,260" fill="${C.orange}" fill-opacity="0.4"/>
</svg>`);

function frame({ kind, title, titleLead = null, subtitle = '', side = null }, body, hint, now, assets = NO_ASSETS) {
  return box({ flexDirection: 'column', width: WIDTH, background: C.page, color: C.ink }, [
    // Content keeps out of the right-hand strip where the stripes are, and is
    // positioned so it paints above them.
    box({ position: 'relative', flexDirection: 'column', padding: '24px 112px 26px 32px', backgroundImage: `linear-gradient(135deg, ${C.header} 0%, ${C.header2} 100%)`, borderBottom: `4px solid ${C.orange}`, overflow: 'hidden' }, [
      img(STRIPES, 120, 260, { position: 'absolute', top: 0, right: 0 }),
      box({ position: 'relative', alignItems: 'center', justifyContent: 'space-between' }, [
        box({ alignItems: 'center', gap: 12 }, [
          img(assets.logo(), 40, 39),
          box({ flexDirection: 'column' }, [
            num({ fontSize: 22, color: '#ffffff', letterSpacing: 2, lineHeight: 1 }, 'POTATO CUP'),
            text({ fontSize: 12, color: C.orange, letterSpacing: 2, marginTop: 4 }, kind),
          ]),
        ]),
        num({ fontSize: 18, fontWeight: 600, color: C.faint }, stamp(now)),
      ]),
      box({ position: 'relative', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 22, gap: 16 }, [
        box({ flexDirection: 'column', flexShrink: 1 }, [
          box({ alignItems: 'center', gap: 12 }, [titleLead, text({ fontSize: 36, fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }, title)]),
          subtitle ? text({ fontSize: 15, color: C.faint, marginTop: 6 }, subtitle) : null,
        ]),
        side,
      ]),
    ]),
    box({ flexDirection: 'column', padding: '22px 24px 22px', gap: 12 }, body),
    box({ justifyContent: 'space-between', alignItems: 'center', background: C.header, padding: '14px 32px' }, [
      text({ fontSize: 14, color: '#c7cdd8' }, hint),
      num({ fontSize: 15, fontWeight: 600, color: C.orange, letterSpacing: 2 }, 'POTATO CUP'),
    ]),
  ]);
}

const TONES = {
  orange: [C.orangeSoft, C.orangeInk], green: [C.winSoft, C.win], grey: [C.soft, C.muted], red: [C.lossSoft, C.loss],
};
const pill = (label, tone) => {
  const [bg, fg] = TONES[tone] || TONES.grey;
  return text({ fontSize: 14, fontWeight: 700, color: fg, background: bg, padding: '5px 12px', borderRadius: 999 }, label);
};
const card = (style, children) => box({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px', ...style }, children);
const section = (label, extra = '') => box({ alignItems: 'center', gap: 8, marginTop: 4 }, [
  box({ width: 4, height: 16, borderRadius: 2, background: C.orange }, []),
  text({ fontSize: 16, fontWeight: 700, color: C.ink }, label),
  extra ? text({ fontSize: 14, color: C.faint }, extra) : null,
]);
const empty = (label, sub = '') => card({ flexDirection: 'column', alignItems: 'center', padding: '30px 20px' }, [
  text({ fontSize: 20, color: C.muted }, label),
  sub ? text({ fontSize: 15, color: C.faint, marginTop: 6 }, sub) : null,
]);

function dateTile(scheduled, tone = 'grey') {
  const d = dateParts(scheduled);
  const [bg, fg] = tone === 'orange' ? [C.orangeSoft, C.orangeInk] : [C.soft, C.ink];
  if (!d) return box({ width: 66, height: 74, borderRadius: 12, background: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [text({ fontSize: 14, color: C.muted }, '待定')]);
  return box({ flexDirection: 'column', width: 66, height: 74, borderRadius: 12, background: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [
    text({ fontSize: 12, color: tone === 'orange' ? C.orangeInk : C.muted }, `${d.month}月`),
    num({ fontSize: 32, color: fg, lineHeight: 1 }, d.day),
    text({ fontSize: 12, color: C.muted, marginTop: 2 }, d.weekday),
  ]);
}

const timeLine = (scheduled) => {
  const d = dateParts(scheduled);
  return d?.time ? `${d.time} 开赛` : '时间待定';
};

// ---- 赛程 ----

const STATUS = { registration: ['报名中', 'orange'], in_progress: ['进行中', 'green'] };

function actionCard(i) {
  const [verb, detail] = {
    confirm: ['请确认比分', `${i.score?.[0] ?? '?'} : ${i.score?.[1] ?? '?'}`],
    ban: ['轮到你禁用', 'BAN'],
    ready: ['可以开打', 'GO'],
  }[i.kind] || [i.kind, ''];
  return box({ borderRadius: 16, padding: '16px 22px', backgroundImage: `linear-gradient(120deg, ${C.orange} 0%, ${C.orangeDeep} 100%)`, color: '#ffffff', alignItems: 'center', justifyContent: 'space-between', gap: 16 }, [
    box({ flexDirection: 'column', flexShrink: 1 }, [
      text({ fontSize: 14, color: '#ffedd5' }, i.tournament),
      text({ fontSize: 26, fontWeight: 700, marginTop: 2 }, verb),
      text({ fontSize: 16, color: '#ffedd5', marginTop: 4 }, `对手 ${i.opponent}`),
    ]),
    detail ? num({ fontSize: 44, color: '#ffffff', flexShrink: 0 }, detail) : null,
  ]);
}

function eventRow(e) {
  const [label, tone] = STATUS[e.status] || [e.status, 'grey'];
  const tags = [pill(label, tone)];
  if (e.status === 'registration' && e.checkin_enabled) tags.push(e.checked_in ? pill('已签到', 'green') : pill('需签到', 'grey'));
  return card({ alignItems: 'center', gap: 16 }, [
    dateTile(e.scheduled_time, e.status === 'in_progress' ? 'orange' : 'grey'),
    box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1 }, [
      text({ fontSize: 21, fontWeight: 700, lineHeight: 1.3 }, e.name),
      text({ fontSize: 15, color: C.muted, marginTop: 4 }, timeLine(e.scheduled_time)),
    ]),
    box({ flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }, tags),
  ]);
}

export function scheduleCard(s, now, assets = NO_ASSETS) {
  const body = [];
  if (s?.now?.length) body.push(section('现在要做'), ...s.now.map(actionCard));
  body.push(section('我的赛事', s?.events?.length ? `${s.events.length} 场` : ''));
  body.push(...(s?.events?.length ? s.events.map(eventRow) : [empty('没有报名未结束的比赛', '发送「报名」查看正在报名的赛事')]));
  return frame({ kind: 'SCHEDULE · 赛程', title: `${s?.player_id ?? ''} 的赛程` }, body, '@土豆杯机器人 报名 · 查看可报名的赛事', now, assets);
}

// ---- 报名 ----

function openRow(e, i) {
  const full = e.player_count >= e.player_capacity;
  const closed = full && !e.registered;
  const share = e.player_capacity ? Math.min(1, e.player_count / e.player_capacity) : 0;
  const tags = [];
  if (e.registered) tags.push(pill(e.checkin_enabled && e.checked_in ? '已签到' : '已报名', 'green'));
  else if (full) tags.push(pill('已满', 'grey'));
  if (!e.registered && e.checkin_enabled) tags.push(pill('需签到', 'orange'));
  return card({ alignItems: 'center', gap: 14, position: 'relative', opacity: closed ? 0.75 : 1 }, [
    num({ width: 36, height: 36, borderRadius: 999, background: closed ? C.soft : C.orange, color: closed ? C.muted : '#ffffff', fontSize: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, i + 1),
    dateTile(e.scheduled_time),
    box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1 }, [
      text({ fontSize: 21, fontWeight: 700, lineHeight: 1.3 }, e.name),
      box({ alignItems: 'center', gap: 10, marginTop: 8 }, [
        text({ fontSize: 15, color: C.muted }, timeLine(e.scheduled_time)),
        box({ width: 120, height: 8, borderRadius: 999, background: C.soft }, [
          box({ width: Math.max(4, Math.round(120 * share)), height: 8, borderRadius: 999, background: full ? C.faint : C.orange }, []),
        ]),
        num({ fontSize: 18, fontWeight: 600, color: C.muted }, `${e.player_count}/${e.player_capacity}`),
      ]),
    ]),
    box({ flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }, tags),
  ]);
}

export function openEventsCard(data, now, assets = NO_ASSETS) {
  const events = data?.events || [];
  const first = events.findIndex((e) => !e.registered && e.player_count < e.player_capacity);
  const hint = !data?.player_id
    ? '先绑定：网站铃铛 →「QQ 群提醒」→ 获取绑定码'
    : first >= 0 ? `@土豆杯机器人 报名 ${first + 1} · 取消报名 编号` : '@土豆杯机器人 取消报名 编号';
  return frame({ kind: 'SIGN UP · 报名', title: '正在报名', subtitle: events.length ? `${events.length} 场赛事开放报名` : '' },
    events.length ? events.map(openRow) : [empty('目前没有正在报名的赛事', '新赛事开放报名时群里会通知')], hint, now, assets);
}

// ---- 战绩 ----

/** A ring for the win rate (drawn as SVG; the number is laid over it). */
function ring(share) {
  const r = 52;
  const len = 2 * Math.PI * r;
  const on = Math.max(0, Math.min(1, share)) * len;
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<circle cx="64" cy="64" r="${r}" fill="none" stroke="${C.soft}" stroke-width="12"/>
${on > 0 ? `<circle cx="64" cy="64" r="${r}" fill="none" stroke="${C.orange}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${on.toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 64 64)"/>` : ''}
</svg>`);
}

/** MMR line of the last games (oldest first), or null with fewer than 2 points. */
function sparkline(history, width = 600, height = 70) {
  const games = (history || []).slice(0, 30).reverse();
  const values = games.length ? [games[0].mmr_before ?? games[0].mmr_after, ...games.map((h) => h.mmr_after)].filter(Number.isFinite) : [];
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 8) + 4, height - 6 - ((v - min) / span) * (height - 12)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `4,${height} ${line} ${(width - 4).toFixed(1)},${height}`;
  const [lx, ly] = pts.at(-1);
  return {
    min, max, first: values[0], last: values.at(-1),
    src: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.orange}" stop-opacity="0.28"/><stop offset="1" stop-color="${C.orange}" stop-opacity="0"/></linearGradient></defs>
<polygon points="${area}" fill="url(#g)"/>
<polyline points="${line}" fill="none" stroke="${C.orange}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5" fill="${C.orange}" stroke="#fff" stroke-width="2"/>
</svg>`),
  };
}

const tile = (label, value, { color = C.ink, sub = '' } = {}) => card({ flexDirection: 'column', flexGrow: 1, flexBasis: 0, padding: '14px 16px' }, [
  text({ fontSize: 14, color: C.muted }, label),
  num({ fontSize: 38, color, lineHeight: 1.1, marginTop: 4 }, value),
  sub ? text({ fontSize: 13, color: C.faint, marginTop: 2 }, sub) : null,
]);

function formChip(g) {
  return box({ flexDirection: 'column', alignItems: 'center', flexGrow: 1, flexBasis: 0, gap: 6 }, [
    num({ width: 48, height: 48, borderRadius: 12, background: g.won ? C.winSoft : C.lossSoft, color: g.won ? C.win : C.loss, fontSize: 26, alignItems: 'center', justifyContent: 'center' }, g.won ? 'W' : 'L'),
    text({ fontSize: 13, color: C.muted, maxWidth: 110, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }, g.opponent_name || g.opponent_id || ''),
    num({ fontSize: 15, fontWeight: 600, color: g.mmr_delta >= 0 ? C.win : C.loss }, `${g.mmr_delta >= 0 ? '+' : ''}${g.mmr_delta ?? 0}`),
  ]);
}

/**
 * `p`: the player's row of GET /players/statistics; `ladder`: GET
 * /ladder/players/:id (league, MMR, games newest first) or null when they
 * have no ladder games.
 */
export function statsCard(p, ladder = null, now = new Date(), assets = NO_ASSETS) {
  const won = p?.matches_won || 0;
  const lost = p?.matches_lost || 0;
  const share = won + lost ? won / (won + lost) : 0;
  const rate = won + lost ? `${Math.round(share * 100)}%` : '—';
  const name = p?.display_name || p?.id || '';
  const tier = ladder?.tier?.group && ladder.tier.group !== 'unrated' ? ladder.tier : null;
  const side = ladder ? box({ alignItems: 'center', gap: 12, flexShrink: 0 }, [
    tier ? img(assets.league(tier.group), 58, 58) : null,
    box({ flexDirection: 'column', alignItems: 'flex-end' }, [
      text({ fontSize: 14, color: C.faint }, tier ? tier.name : (ladder.provisional ? '定级中' : '天梯')),
      box({ alignItems: 'flex-end', gap: 6 }, [
        num({ fontSize: 44, color: C.orange, lineHeight: 1 }, Math.round(ladder.mmr ?? 0)),
        num({ fontSize: 16, fontWeight: 600, color: C.faint, marginBottom: 4 }, 'MMR'),
      ]),
    ]),
  ]) : null;

  const body = [
    box({ gap: 12 }, [
      card({ alignItems: 'center', gap: 20, flexGrow: 1.4, flexBasis: 0 }, [
        box({ position: 'relative', width: 128, height: 128, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [
          img(ring(share), 128, 128, { position: 'absolute', top: 0, left: 0 }),
          box({ flexDirection: 'column', alignItems: 'center' }, [
            num({ fontSize: 36, color: C.ink, lineHeight: 1 }, rate),
            text({ fontSize: 13, color: C.muted, marginTop: 2 }, '胜率'),
          ]),
        ]),
        box({ flexDirection: 'column', gap: 10, flexGrow: 1 }, [
          box({ alignItems: 'flex-end', gap: 8 }, [
            num({ fontSize: 48, color: C.win, lineHeight: 1 }, won), text({ fontSize: 16, color: C.muted, marginBottom: 5 }, '胜'),
            num({ fontSize: 48, color: C.loss, lineHeight: 1, marginLeft: 14 }, lost), text({ fontSize: 16, color: C.muted, marginBottom: 5 }, '负'),
          ]),
          // Wins against losses, as one bar.
          box({ height: 10, borderRadius: 999, background: won + lost ? C.lossSoft : C.soft, overflow: 'hidden' }, [
            box({ width: `${Math.round(share * 100)}%`, height: 10, background: C.win }, []),
          ]),
          box({ justifyContent: 'space-between' }, [
            text({ fontSize: 14, color: C.muted }, `共 ${won + lost} 场比赛`),
            text({ fontSize: 14, color: C.muted }, `小局 ${p?.maps_won || 0} : ${p?.maps_lost || 0}`),
          ]),
        ]),
      ]),
    ]),
    box({ gap: 12 }, [
      tile('参赛', p?.tournaments_played || 0, { sub: '场赛事' }),
      tile('冠军', p?.championships || 0, { color: (p?.championships || 0) ? C.prize : C.ink }),
      tile('亚军', p?.runner_ups || 0),
      tile('天梯', ladder?.games ?? 0, { sub: '场对局' }),
    ]),
  ];
  const recent = (ladder?.history || []).slice(0, 5);
  if (recent.length) {
    body.push(section('最近比赛', '天梯对局'));
    body.push(card({ padding: '16px 12px' }, recent.map(formChip)));
  }
  const spark = sparkline(ladder?.history);
  if (spark) {
    const diff = Math.round(spark.last - spark.first);
    body.push(section('MMR 走势', `最近 ${Math.min(30, ladder.history.length)} 场`));
    body.push(card({ flexDirection: 'column', gap: 8 }, [
      box({ justifyContent: 'space-between' }, [
        num({ fontSize: 15, fontWeight: 600, color: C.faint }, `${Math.round(spark.min)} – ${Math.round(spark.max)}`),
        num({ fontSize: 18, color: diff >= 0 ? C.win : C.loss }, `${diff >= 0 ? '+' : ''}${diff}`),
      ]),
      img(spark.src, 640, 74),
    ]));
  }
  return frame({
    kind: 'PLAYER · 战绩',
    title: name,
    titleLead: img(assets.flag(p?.flag || ladder?.flag), 36, 27, { borderRadius: 4 }),
    subtitle: p?.team ? `${p.team} · 全部赛事` : '全部赛事',
    side,
  }, body, '@土豆杯机器人 战绩 选手名 · 查其他选手', now, assets);
}
