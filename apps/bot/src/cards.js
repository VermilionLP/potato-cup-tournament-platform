// Picture replies for the official bot: 赛程, 报名 and 战绩 as PNG cards in
// the site's look (light page, dark header, brand orange, HarmonyOS Sans).
//
// Layout: Satori (flexbox -> SVG, text turned into outlines) then resvg
// (SVG -> PNG at 2x). The font is the site's own HarmonyOS Sans SC, which
// ships as ~80 small woff2 files per weight split by unicode-range: for each
// card only the files covering its characters are decompressed (wawoff2,
// cached), each under its own family name, all listed in font-family so a
// character missing from one file is taken from the next. (resvg's own font
// loading rejects these split files and silently falls back to system
// fonts, which the server does not have.)

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import wawoff from 'wawoff2';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { shortTime } from './format.js';

const WIDTH = 720;
const C = {
  page: '#f7f7f5', card: '#ffffff', ink: '#14161b', muted: '#5b6170', border: '#e5e5e2', soft: '#f1f1ee',
  header: '#0b0d12', headerMuted: '#8b95a5', orange: '#f97316', orangeInk: '#c2410c', orangeSoft: '#ffedd5',
  green: '#15803d', greenSoft: '#dcfce7', red: '#b91c1c',
};
const WEIGHTS = { 400: 'Regular', 700: 'Bold' };

function defaultFontDir() {
  // The package exports only its CSS (dist/index.css); the woff2 files sit next to it.
  return dirname(createRequire(import.meta.url).resolve('harmonyos-sans-sc-webfont-splitted'));
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

export function createRenderer({ fontDir = defaultFontDir() } = {}) {
  const sets = Object.fromEntries(Object.entries(WEIGHTS).map(([w, name]) => [w, parseRanges(readFileSync(join(fontDir, `${name}.css`), 'utf8'))]));
  const ttf = new Map(); // woff2 file -> decompressed font

  async function fontsFor(text) {
    const cps = [...new Set([...text].map((c) => c.codePointAt(0)))];
    const fonts = [];
    for (const [weight, files] of Object.entries(sets)) {
      for (const f of files) {
        if (!cps.some((cp) => f.ranges.some(([a, b]) => cp >= a && cp <= b))) continue;
        if (!ttf.has(f.file)) ttf.set(f.file, Buffer.from(await wawoff.decompress(readFileSync(join(fontDir, f.file)))));
        fonts.push({ name: `hm-${f.file.replace(/\.woff2$/, '')}`, data: ttf.get(f.file), weight: Number(weight), style: 'normal' });
      }
    }
    return fonts;
  }

  /** PNG of a card tree, 2x for sharp text on phones. */
  async function render(tree) {
    const fonts = await fontsFor(textOf(tree));
    const root = { ...tree, props: { ...tree.props, style: { ...tree.props.style, fontFamily: fonts.map((f) => f.name).join(', ') } } };
    const svg = await satori(root, { width: WIDTH, fonts });
    return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH * 2 }, font: { loadSystemFonts: false } }).render().asPng();
  }

  return {
    render,
    schedule: (data, now) => render(scheduleCard(data, now)),
    openEvents: (data, now) => render(openEventsCard(data, now)),
    stats: (player, now) => render(statsCard(player, now)),
  };
}

// ---- Building blocks ----

const el = (type, style, children) => ({ type, props: { style, children } });
const box = (style, children) => el('div', { display: 'flex', ...style }, children);
const text = (style, value) => el('div', { display: 'flex', ...style }, String(value));

/** "11月10日 12:20" in Beijing time, for the header. */
function stamp(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600_000);
  const pad = (v) => String(v).padStart(2, '0');
  return `${bj.getUTCMonth() + 1}月${bj.getUTCDate()}日 ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`;
}

function frame(title, subtitle, body, footer, now) {
  return box({ flexDirection: 'column', width: WIDTH, background: C.page, color: C.ink }, [
    box({ flexDirection: 'column', background: C.header, padding: '26px 32px 24px' }, [
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        text({ fontSize: 15, fontWeight: 700, color: C.orange, letterSpacing: 3 }, 'POTATO CUP'),
        text({ fontSize: 14, color: C.headerMuted }, stamp(now)),
      ]),
      text({ fontSize: 34, fontWeight: 700, color: '#ffffff', marginTop: 8 }, title),
      subtitle ? text({ fontSize: 16, color: C.headerMuted, marginTop: 4 }, subtitle) : null,
    ]),
    box({ flexDirection: 'column', padding: '22px 24px 8px', gap: 12 }, body),
    box({ padding: '8px 32px 22px' }, [text({ fontSize: 14, color: C.muted }, footer)]),
  ]);
}

const pill = (label, tone) => {
  const tones = {
    orange: [C.orangeSoft, C.orangeInk],
    green: [C.greenSoft, C.green],
    grey: [C.soft, C.muted],
  };
  const [bg, fg] = tones[tone] || tones.grey;
  return text({ fontSize: 15, fontWeight: 700, color: fg, background: bg, padding: '4px 12px', borderRadius: 999 }, label);
};

const card = (style, children) => box({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 20px', ...style }, children);
const sectionTitle = (label) => text({ fontSize: 15, fontWeight: 700, color: C.muted, letterSpacing: 1, marginTop: 4 }, label);
const empty = (label) => card({ justifyContent: 'center', padding: '28px 20px' }, [text({ fontSize: 20, color: C.muted }, label)]);

// ---- 赛程 ----

const STATUS = { registration: ['报名中', 'orange'], in_progress: ['进行中', 'green'] };

function nowItem(i) {
  const action = {
    confirm: ['请确认比分', `${i.score?.[0] ?? '?'} : ${i.score?.[1] ?? '?'}`],
    ban: ['轮到你禁用', ''],
    ready: ['可以开打', ''],
  }[i.kind] || [i.kind, ''];
  return box({ background: C.orangeSoft, borderRadius: 14, padding: '14px 20px', borderLeft: `6px solid ${C.orange}`, justifyContent: 'space-between', alignItems: 'center' }, [
    box({ flexDirection: 'column' }, [
      text({ fontSize: 14, color: C.orangeInk }, i.tournament),
      text({ fontSize: 24, fontWeight: 700, marginTop: 2 }, `${action[0]}${action[1] ? `  ${action[1]}` : ''}`),
    ]),
    text({ fontSize: 18, color: C.muted }, `对手 ${i.opponent}`),
  ]);
}

function eventRow(e) {
  const [label, tone] = STATUS[e.status] || [e.status, 'grey'];
  const tags = [pill(label, tone)];
  if (e.status === 'registration' && e.checkin_enabled) tags.push(e.checked_in ? pill('已签到', 'green') : pill('需签到', 'grey'));
  return card({ justifyContent: 'space-between', alignItems: 'center' }, [
    box({ flexDirection: 'column', flexShrink: 1, marginRight: 12 }, [
      text({ fontSize: 22, fontWeight: 700 }, e.name),
      text({ fontSize: 16, color: C.muted, marginTop: 4 }, shortTime(e.scheduled_time)),
    ]),
    box({ gap: 8, flexShrink: 0 }, tags),
  ]);
}

export function scheduleCard(s, now) {
  const body = [];
  if (s?.now?.length) body.push(sectionTitle('现在要做'), ...s.now.map(nowItem));
  body.push(sectionTitle('已报名的赛事'));
  body.push(...(s?.events?.length ? s.events.map(eventRow) : [empty('没有报名未结束的比赛')]));
  return frame(`${s?.player_id ?? ''} 的赛程`, null, body, '@土豆杯机器人 报名 · 查看正在报名的赛事', now);
}

// ---- 报名 ----

function openRow(e, i) {
  const full = e.player_count >= e.player_capacity;
  const share = e.player_capacity ? Math.min(1, e.player_count / e.player_capacity) : 0;
  const tags = [];
  if (e.registered) tags.push(pill(e.checkin_enabled && e.checked_in ? '已报名 · 已签到' : '已报名', 'green'));
  else if (full) tags.push(pill('已满', 'grey'));
  if (!e.registered && e.checkin_enabled) tags.push(pill('需签到', 'grey'));
  return card({ alignItems: 'center', gap: 16 }, [
    text({ width: 44, height: 44, borderRadius: 999, background: full && !e.registered ? C.soft : C.orange, color: full && !e.registered ? C.muted : '#ffffff', fontSize: 22, fontWeight: 700, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, i + 1),
    box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1 }, [
      text({ fontSize: 22, fontWeight: 700 }, e.name),
      box({ alignItems: 'center', gap: 12, marginTop: 6 }, [
        text({ fontSize: 16, color: C.muted }, shortTime(e.scheduled_time)),
        box({ width: 140, height: 8, borderRadius: 999, background: C.soft }, [
          box({ width: Math.round(140 * share), height: 8, borderRadius: 999, background: full ? C.muted : C.orange }, []),
        ]),
        text({ fontSize: 16, color: C.muted }, `${e.player_count}/${e.player_capacity} 人`),
      ]),
    ]),
    box({ flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }, tags),
  ]);
}

export function openEventsCard(data, now) {
  const events = data?.events || [];
  const first = events.findIndex((e) => !e.registered && e.player_count < e.player_capacity);
  const footer = !data?.player_id
    ? '先绑定：网站右上角铃铛 →「QQ 群提醒」获取绑定码，@土豆杯机器人 绑定 123456'
    : first >= 0 ? `@土豆杯机器人 报名 ${first + 1} 即可报名 · 取消报名 编号 退出` : '@土豆杯机器人 取消报名 编号 退出报名';
  return frame('正在报名', events.length ? `${events.length} 场赛事开放报名` : null,
    events.length ? events.map(openRow) : [empty('目前没有正在报名的赛事')], footer, now);
}

// ---- 战绩 ----

const tile = (label, value, { accent = false, sub = '', bar = null } = {}) => card({ flexDirection: 'column', flexGrow: 1, flexBasis: 0, padding: '16px 18px' }, [
  text({ fontSize: 15, color: C.muted }, label),
  text({ fontSize: accent ? 44 : 34, fontWeight: 700, color: accent ? C.orangeInk : C.ink, marginTop: 4 }, value),
  bar == null ? null : box({ height: 8, borderRadius: 999, background: C.soft, marginTop: 8 }, [
    box({ width: `${Math.round(bar * 100)}%`, height: 8, borderRadius: 999, background: C.orange }, []),
  ]),
  sub ? text({ fontSize: 14, color: C.muted, marginTop: 6 }, sub) : null,
]);

export function statsCard(p, now) {
  const won = p?.matches_won || 0;
  const lost = p?.matches_lost || 0;
  const rate = won + lost ? `${Math.round((won / (won + lost)) * 100)}%` : '—';
  const share = won + lost ? won / (won + lost) : 0;
  return frame(`${p?.display_name || p?.id || ''} 的战绩`, '全部赛事', [
    box({ gap: 12 }, [
      tile('胜率', rate, { accent: true, sub: `${won} 胜 ${lost} 负`, bar: share }),
      tile('参赛', p?.tournaments_played || 0, { sub: '场赛事' }),
    ]),
    box({ gap: 12 }, [
      tile('小局', `${p?.maps_won || 0} : ${p?.maps_lost || 0}`),
      tile('冠军', p?.championships || 0),
      tile('亚军', p?.runner_ups || 0),
    ]),
  ], '@土豆杯机器人 战绩 选手名 · 查询其他选手', now);
}
