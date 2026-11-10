// Picture replies for the official bot: 报名, 赛程, 战绩 and 帮助 as PNG
// cards that look like pages of the site: the black top bar with the
// POTATO CUP wordmark, a page header (orange icon tile, title, subtitle),
// white rounded cards on the light page, the site's tags (tier, mode,
// vehicle pool, format, status with a dot), lucide icons (src/icons.js),
// HarmonyOS Sans SC for text and Barlow Condensed for titles and numbers.
//
// Every card also says what to do next: the command to send, as a chip
// (报名 1, 签到, 赛程…), and where it helps a numbered guide like the site's
// event stepper (绑定 → 报名 → 签到 → 比赛) with the player's own progress.
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
import { iconUri } from './icons.js';
import { DISCORD_INVITE } from './format.js';

const WIDTH = 720;
// The site's light theme (apps/web/src/app.css) and tag tones (lib/tags.js).
const C = {
  page: '#f7f7f5', card: '#ffffff', ink: '#14161b', muted: '#5b6170', faint: '#8b95a5', border: '#e5e5e2', soft: '#f1f1ee',
  bar: '#0b0d12', orange: '#f97316', orangeInk: '#c2410c', orangeSoft: '#ffedd5', orangeSoftInk: '#9a3412',
  win: '#16a34a', winSoft: '#dcfce7', loss: '#e11d48', lossSoft: '#ffe4e6', prize: '#d97706',
};
const TONES = {
  neutral: ['#ececea', '#3f4451'],
  brand: [C.orangeSoft, C.orangeSoftInk],
  info: ['#e0f2fe', '#075985'],
  live: ['#fee2e2', '#b91c1c'],
  success: ['#dcfce7', '#166534'],
  prize: ['#fef3c7', '#92400e'],
  special: ['#fae8ff', '#86198f'],
};
const WEIGHTS = { 400: 'Regular', 700: 'Bold' };
const DISPLAY = 'DISPLAY'; // replaced by Barlow Condensed + the HarmonyOS list
export const DEFAULT_SITE_HOST = 'potatocup-warthunder.com';
const BOT = '@土豆杯机器人';

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
const NO_ASSETS = { wordmark: () => null, flag: () => null, league: () => null, host: DEFAULT_SITE_HOST };

const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

export function createRenderer({
  fontDir = defaultFontDir(),
  staticDir = join(here, '..', '..', 'web', 'static'),
  assetDir = join(here, '..', 'assets'),
  siteHost = DEFAULT_SITE_HOST,
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

  // Pictures (the wordmark here; flags and league icons from the site), cached as data URIs.
  const files = new Map();
  const asset = (full, type) => {
    if (!files.has(full)) files.set(full, existsSync(full) ? `data:${type};base64,${readFileSync(full).toString('base64')}` : null);
    return files.get(full);
  };
  const assets = {
    host: siteHost,
    wordmark: () => asset(join(assetDir, 'wordmark.png'), 'image/png'),
    flag: (code) => (/^[a-z]{2}(-[a-z]+)?$/.test(String(code || '')) ? asset(join(staticDir, 'flags', `${code}.svg`), 'image/svg+xml') : null),
    league: (group) => (/^[a-z]+$/.test(String(group || '')) ? asset(join(staticDir, 'sc2-icons', 'league', `${group}.svg`), 'image/svg+xml') : null),
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
    help: (now) => render(helpCard(now, assets)),
  };
}

// ---- Building blocks ----

const el = (type, style, children) => ({ type, props: { style, children } });
const box = (style, children) => el('div', { display: 'flex', ...style }, children);
const text = (style, value) => el('div', { display: 'flex', ...style }, String(value));
const num = (style, value) => text({ fontFamily: DISPLAY, fontWeight: 700, ...style }, value);
const img = (src, width, height, style = {}) => (src ? { type: 'img', props: { src, width, height, style } } : null);
const icon = (name, size, color, style = {}) => img(iconUri(name, color), size, size, { flexShrink: 0, ...style });

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

/** "11/20 周五 20:00", as the site writes event times. */
export function whenText(scheduled) {
  const d = dateParts(scheduled);
  if (!d) return '时间待定';
  return `${d.month}/${d.day} ${d.weekday}${d.time ? ` ${d.time}` : ''}`;
}

/** "11/10 12:20" in Beijing time, for the footer. */
function stamp(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600_000);
  const pad = (v) => String(v).padStart(2, '0');
  return `${bj.getUTCMonth() + 1}/${bj.getUTCDate()} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`;
}

/** A tag as on the site; `dot` for live states ("● 比赛进行中"). */
function tag(label, tone = 'neutral', { dot = false, iconName = null } = {}) {
  const [bg, fg] = TONES[tone] || TONES.neutral;
  return box({ alignItems: 'center', gap: 5, background: bg, color: fg, borderRadius: 7, padding: '3px 9px', flexShrink: 0 }, [
    dot ? box({ width: 7, height: 7, borderRadius: 999, background: fg }, []) : null,
    iconName ? icon(iconName, 14, fg) : null,
    text({ fontSize: 13, fontWeight: 700 }, label),
  ]);
}

/**
 * A command to send, as a chip: filled orange for the main next step (the
 * site's orange button), outlined for the others.
 */
function cmd(label, { main = false, size = 15 } = {}) {
  return box({
    alignItems: 'center', gap: 6, flexShrink: 0, borderRadius: 9, padding: main ? '7px 13px' : '6px 12px',
    background: main ? C.orange : C.card, border: main ? `1px solid ${C.orange}` : `1px solid ${C.border}`,
    color: main ? '#ffffff' : C.ink,
  }, [
    text({ fontSize: size - 3, color: main ? '#ffedd5' : C.faint }, '发送'),
    text({ fontSize: size, fontWeight: 700 }, label),
  ]);
}

const card = (style, children) => box({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px', ...style }, children);

const section = (label, extra = '') => box({ alignItems: 'baseline', gap: 8, marginTop: 6 }, [
  text({ fontSize: 17, fontWeight: 700, color: C.ink }, label),
  extra ? text({ fontSize: 13, color: C.faint }, extra) : null,
]);

/** The site's icon tile (PageHeader, stat cards). */
const iconTile = (name, size = 52, tone = 'brand') => {
  const [bg, fg] = tone === 'brand' ? [C.orangeSoft, C.orangeInk] : TONES[tone] || TONES.neutral;
  return box({ width: size, height: size, borderRadius: Math.round(size * 0.28), background: bg, border: `1px solid ${tone === 'brand' ? '#fed7aa' : 'transparent'}`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [
    icon(name, Math.round(size * 0.48), fg),
  ]);
};

/** A grey box saying there is nothing here, and what to do instead. */
const empty = (label, sub = '', action = null) => card({ flexDirection: 'column', alignItems: 'center', padding: '28px 20px', gap: 8 }, [
  text({ fontSize: 19, fontWeight: 700, color: C.muted }, label),
  sub ? text({ fontSize: 14, color: C.faint, textAlign: 'center' }, sub) : null,
  action,
]);

/** The page: top bar, page header, body, footer. */
function page({ iconName, title, titleLead = null, subtitle = '', side = null }, body, now, assets = NO_ASSETS) {
  const wordmark = assets.wordmark();
  return box({ flexDirection: 'column', width: WIDTH, background: C.page, color: C.ink }, [
    // The site's top bar.
    box({ height: 60, background: C.bar, alignItems: 'center', justifyContent: 'space-between', padding: '0 26px' }, [
      wordmark ? img(wordmark, 129, 32) : num({ fontSize: 26, color: '#ffffff', letterSpacing: 1 }, 'POTATO CUP'),
      box({ alignItems: 'center', gap: 8 }, [
        box({ width: 7, height: 7, borderRadius: 999, background: C.orange }, []),
        text({ fontSize: 13, color: '#c7cdd8' }, 'QQ 机器人'),
      ]),
    ]),
    // PageHeader: icon tile, title, subtitle; a divider under it.
    box({ flexDirection: 'column', padding: '24px 26px 0' }, [
      box({ alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }, [
        box({ alignItems: 'center', gap: 14, flexShrink: 1 }, [
          iconName ? iconTile(iconName) : null,
          box({ flexDirection: 'column', flexShrink: 1 }, [
            box({ alignItems: 'center', gap: 10 }, [titleLead, text({ fontSize: 30, fontWeight: 700, lineHeight: 1.2 }, title)]),
            subtitle ? text({ fontSize: 14, color: C.muted, marginTop: 4 }, subtitle) : null,
          ]),
        ]),
        side,
      ]),
    ]),
    box({ flexDirection: 'column', padding: '18px 24px 22px', gap: 12 }, body),
    // Footer: where the full pages are.
    box({ alignItems: 'center', justifyContent: 'space-between', padding: '13px 26px', borderTop: `1px solid ${C.border}`, background: C.card }, [
      box({ alignItems: 'center', gap: 7 }, [
        icon('globe', 16, C.orangeInk),
        text({ fontSize: 14, fontWeight: 700, color: C.ink }, assets.host || DEFAULT_SITE_HOST),
      ]),
      text({ fontSize: 13, color: C.faint }, `${stamp(now)} · Potato Cup`),
    ]),
  ]);
}

// The Discord server: where players go after registering.
const DISCORD_LOGO = svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="#ffffff" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.11 13.11 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>');
const BLURPLE = '#5865F2';

function discordRow(title = '报名后加入 Discord 服务器') {
  return box({ alignItems: 'center', gap: 14, borderRadius: 18, padding: '14px 18px', background: '#eef0ff', border: `1px solid #c7ccfb` }, [
    box({ width: 44, height: 44, borderRadius: 12, background: BLURPLE, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [img(DISCORD_LOGO, 26, 26)]),
    box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1 }, [
      text({ fontSize: 17, fontWeight: 700, color: C.ink }, title),
      text({ fontSize: 13, color: C.muted, marginTop: 2 }, '赛事通知、和对手约战、找管理员都在服务器里'),
    ]),
    text({ fontSize: 16, fontWeight: 700, color: '#ffffff', background: BLURPLE, borderRadius: 10, padding: '8px 14px', flexShrink: 0 }, DISCORD_INVITE.replace(/^https?:\/\//, '')),
  ]);
}

// ---- Guides ----

/**
 * The steps of taking part, with this player's progress: bind, register,
 * check in (when any event needs it), play. Each { id, label, sub, cmd?,
 * state: 'done' | 'current' | 'todo' }.
 */
export function signupSteps(data) {
  const events = data?.events || [];
  const bound = Boolean(data?.player_id);
  const mine = events.filter((e) => e.registered);
  const firstOpen = events.findIndex((e) => !e.registered && e.player_count < e.player_capacity);
  const checkins = mine.filter((e) => e.checkin_enabled);
  const steps = [
    bound
      ? { id: 'bind', label: '绑定选手', sub: `已绑定 ${data.player_id}`, done: true }
      : { id: 'bind', label: '绑定选手', sub: '网站铃铛 →「QQ 群提醒」拿绑定码', cmd: '绑定 123456' },
    mine.length
      ? { id: 'register', label: '报名赛事', sub: `已报名 ${mine.length} 场`, done: true }
      : { id: 'register', label: '报名赛事', sub: '按列表编号报名', cmd: firstOpen >= 0 ? `报名 ${firstOpen + 1}` : '报名 编号' },
  ];
  // Check-in, when an event here asks for it. Registered only for events
  // without check-in: nothing to do, the step is done.
  if (events.some((e) => e.checkin_enabled)) {
    const pending = checkins.filter((e) => !e.checked_in);
    const skip = mine.length > 0 && checkins.length === 0;
    steps.push({
      id: 'checkin',
      label: '开赛前签到',
      sub: skip ? '你报名的赛事不用签到'
        : pending.some((e) => e.checkin_open) ? '签到已开放，现在就签'
          : checkins.length && !pending.length ? '已签到' : '开赛前 30 分钟开放',
      cmd: '签到',
      done: skip || (checkins.length > 0 && pending.length === 0),
    });
  }
  steps.push({ id: 'play', label: '比赛', sub: '看对阵和要做的事', cmd: '赛程' });
  const current = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ ...s, state: s.done ? 'done' : i === current ? 'current' : 'todo' }));
}

/** The site's stepper (EventSteps), with each step's command under it. */
function stepper(title, steps, note = `在群里 ${BOT} 后发送指令`) {
  const n = steps.length;
  return card({ flexDirection: 'column', gap: 14, padding: '16px 18px 18px', border: `1px solid #fed7aa`, background: '#fffaf5' }, [
    box({ alignItems: 'center', justifyContent: 'space-between' }, [
      box({ alignItems: 'center', gap: 8 }, [icon('list-checks', 18, C.orangeInk), text({ fontSize: 17, fontWeight: 700 }, title)]),
      text({ fontSize: 13, color: C.muted }, note),
    ]),
    box({ alignItems: 'flex-start' }, steps.flatMap((s, i) => {
      const done = s.state === 'done';
      const current = s.state === 'current';
      const dot = box({
        width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: current ? C.orange : done ? C.orangeSoft : C.soft,
      }, [done ? icon('check', 16, C.orangeInk) : num({ fontSize: 17, color: current ? '#ffffff' : C.muted }, i + 1)]);
      const line = (on) => box({ height: 2, flexGrow: 1, background: on ? '#fdba74' : C.border, marginTop: 14 }, []);
      return [
        box({ flexDirection: 'column', alignItems: 'center', width: Math.floor(640 / n) - 4, flexShrink: 0, gap: 6 }, [
          box({ alignItems: 'center', width: '100%' }, [
            i > 0 ? line(done || current) : box({ flexGrow: 1 }, []),
            dot,
            i < n - 1 ? line(done) : box({ flexGrow: 1 }, []),
          ]),
          text({ fontSize: 15, fontWeight: 700, color: current ? C.orangeInk : done ? C.ink : C.muted, marginTop: 2 }, s.label),
          text({ fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.35, padding: '0 6px' }, s.sub),
          s.cmd && !done ? cmd(s.cmd, { main: current, size: 14 }) : null,
        ]),
      ];
    })),
  ]);
}

/** "下一步": other commands worth knowing here. */
function nextUp(items) {
  return card({ alignItems: 'center', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }, [
    text({ fontSize: 14, fontWeight: 700, color: C.muted }, '还可以'),
    ...items.map(([c, what]) => box({ alignItems: 'center', gap: 6 }, [cmd(c, { size: 14 }), text({ fontSize: 13, color: C.muted }, what)])),
  ]);
}

// ---- Event tags (as the site's event list) ----

const MODES = { ab: 'AB', rb: 'RB', sb: 'SB' };
const POOLS = { prop: '螺旋桨', 'legacy-jet': '早期喷气', 'top-jet': '顶级喷气', proleague: 'Pro League BVR' };
const FORMATS = { single_elim: '单败淘汰', double_elim: '双败淘汰', swiss: '瑞士轮' };
const TIERS = { S: 'special', A: 'brand', B: 'success', C: 'info', D: 'neutral' };
const KINDS = { major: '大型赛事', weekly: '周赛', qualifier: '预选赛' };

/** The site's tags of an event: "C 级 · 周赛", RB, 螺旋桨, 单败淘汰. */
export function eventTagList(e) {
  const out = [];
  const tier = e?.tier && TIERS[e.tier] ? `${e.tier} 级` : '';
  const tierText = [tier, KINDS[e?.event_kind] || ''].filter(Boolean).join(' · ');
  if (tierText) out.push([tierText, tier ? TIERS[e.tier] : 'neutral']);
  if (MODES[e?.game_mode]) out.push([MODES[e.game_mode], 'neutral']);
  if (POOLS[e?.vehicle_pool]) out.push([POOLS[e.vehicle_pool], 'neutral']);
  if (e?.two_stage) out.push(['小组赛 + 淘汰赛', 'neutral']);
  else if (FORMATS[e?.format]) out.push([FORMATS[e.format], 'neutral']);
  return out;
}

const eventTitle = (name, style = {}) => num({ fontSize: 25, lineHeight: 1.15, textTransform: 'uppercase', ...style }, name);
const meta = (iconName, label, style = {}) => box({ alignItems: 'center', gap: 5 }, [
  icon(iconName, 15, C.faint),
  text({ fontSize: 14, color: C.muted, ...style }, label),
]);

// ---- 报名 ----

function openRow(e, i, bound) {
  const full = e.player_count >= e.player_capacity;
  const closed = full && !e.registered;
  const share = e.player_capacity ? Math.min(1, e.player_count / e.player_capacity) : 0;
  const right = [];
  if (e.registered) {
    right.push(tag(e.checkin_enabled && e.checked_in ? '已签到' : '已报名', 'success', { iconName: 'check' }));
    if (e.checkin_enabled && !e.checked_in) right.push(e.checkin_open ? cmd('签到', { main: true, size: 14 }) : text({ fontSize: 12, color: C.faint }, '开赛前 30 分钟签到'));
    else right.push(cmd(`取消报名 ${i + 1}`, { size: 13 }));
  } else if (full) {
    right.push(tag('已满', 'neutral'));
  } else {
    right.push(cmd(`报名 ${i + 1}`, { main: bound }));
    if (e.checkin_enabled) right.push(text({ fontSize: 12, color: C.orangeInk }, '需开赛前签到'));
  }
  return card({ alignItems: 'center', gap: 14, opacity: closed ? 0.7 : 1 }, [
    num({ width: 40, height: 40, borderRadius: 12, background: closed ? C.soft : e.registered ? C.orangeSoft : C.orange, color: closed ? C.muted : e.registered ? C.orangeInk : '#ffffff', fontSize: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, i + 1),
    box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 7 }, [
      eventTitle(e.name),
      box({ gap: 6, flexWrap: 'wrap' }, eventTagList(e).map(([label, tone]) => tag(label, tone))),
      box({ alignItems: 'center', gap: 14 }, [
        meta('clock', whenText(e.scheduled_time)),
        box({ alignItems: 'center', gap: 7 }, [
          meta('users', `${e.player_count} / ${e.player_capacity}`, { fontWeight: 700, color: C.ink }),
          box({ width: 90, height: 6, borderRadius: 999, background: C.soft }, [
            box({ width: Math.max(4, Math.round(90 * share)), height: 6, borderRadius: 999, background: full ? C.faint : C.orange }, []),
          ]),
        ]),
      ]),
    ]),
    box({ flexDirection: 'column', gap: 7, alignItems: 'flex-end', flexShrink: 0 }, right),
  ]);
}

export function openEventsCard(data, now, assets = NO_ASSETS) {
  const events = data?.events || [];
  const bound = Boolean(data?.player_id);
  const steps = stepper('怎么报名', signupSteps(data));
  const subtitle = [events.length ? `${events.length} 场赛事开放报名` : '暂时没有开放报名的赛事', bound ? `选手 ${data.player_id}` : '还没有绑定选手'].join(' · ');
  const body = [];
  // Not bound yet: that is the first thing to do, so the guide comes first.
  if (!bound) body.push(steps);
  body.push(section('正在报名', events.length ? '按编号报名' : ''));
  body.push(...(events.length
    ? events.map((e, i) => openRow(e, i, bound))
    : [empty('目前没有正在报名的赛事', '新赛事开放报名时群里会通知', null)]));
  if (bound) body.push(steps);
  body.push(discordRow(events.some((e) => e.registered) ? '下一步：加入 Discord 服务器' : '报名后加入 Discord 服务器'));
  return page({ iconName: 'trophy', title: '赛事报名', subtitle }, body, now, assets);
}

// ---- 赛程 ----

const STATUS = { registration: ['报名中', 'brand', false], in_progress: ['比赛进行中', 'live', true], voting: ['投票中', 'info', false] };
const ACTIONS = {
  confirm: { title: '请确认比分', iconName: 'circle-check', how: '在网站确认或提出异议，10 分钟内不处理会自动生效' },
  ban: { title: '轮到你禁用', iconName: 'swords', how: '在网站打开这场比赛，完成 Ban / Pick' },
  ready: { title: '可以开打了', iconName: 'flag', how: '进游戏开打，结束后任一方在网站填报比分' },
};

function actionCard(i, host) {
  const a = ACTIONS[i.kind] || { title: i.kind, iconName: 'bell-ring', how: '' };
  const detail = i.kind === 'confirm' ? `${i.score?.[0] ?? '?'} : ${i.score?.[1] ?? '?'}` : i.kind === 'ban' ? 'BAN' : 'GO';
  const url = i.tournament_id ? `${host}/tournament/${i.tournament_id}` : host;
  return box({ flexDirection: 'column', borderRadius: 18, border: `2px solid ${C.orange}`, background: '#fff7ed', overflow: 'hidden' }, [
    box({ alignItems: 'center', gap: 14, padding: '16px 18px' }, [
      box({ width: 48, height: 48, borderRadius: 14, background: C.orange, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, [icon(a.iconName, 24, '#ffffff')]),
      box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1 }, [
        text({ fontSize: 13, color: C.orangeInk, fontWeight: 700 }, i.tournament || ''),
        box({ alignItems: 'baseline', gap: 10, marginTop: 1 }, [
          text({ fontSize: 23, fontWeight: 700 }, a.title),
          text({ fontSize: 15, color: C.muted }, `对手 ${i.opponent || '—'}`),
        ]),
        a.how ? text({ fontSize: 13, color: C.muted, marginTop: 4 }, a.how) : null,
      ]),
      num({ fontSize: 44, color: C.orangeInk, lineHeight: 1, flexShrink: 0 }, detail),
    ]),
    box({ alignItems: 'center', gap: 8, padding: '10px 18px', background: C.orange, color: '#ffffff' }, [
      icon('link', 15, '#ffffff'),
      text({ fontSize: 13, color: '#ffedd5' }, '打开'),
      text({ fontSize: 14, fontWeight: 700 }, url),
    ]),
  ]);
}

/** The event's state for this player and the command to move on, if any. */
function nextForEvent(e) {
  if (e.status === 'in_progress') return [text({ fontSize: 12, color: C.faint }, '对阵在网站「对阵」页')];
  if (e.status === 'registration' && e.checkin_enabled) {
    if (e.checked_in) return [tag('已签到', 'success', { iconName: 'check' })];
    if (e.checkin_open) return [cmd('签到', { main: true, size: 14 }), text({ fontSize: 12, color: C.orangeInk }, '签到已开放')];
    return [tag('需签到', 'brand'), text({ fontSize: 12, color: C.faint }, '开赛前 30 分钟开放')];
  }
  return [tag('已报名', 'success', { iconName: 'check' }), text({ fontSize: 12, color: C.faint }, '等待开赛')];
}

function dateTile(scheduled, hot) {
  const d = dateParts(scheduled);
  const [bg, fg] = hot ? [C.orangeSoft, C.orangeInk] : [C.soft, C.ink];
  return box({ flexDirection: 'column', width: 60, height: 68, borderRadius: 14, background: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, d ? [
    text({ fontSize: 12, color: hot ? C.orangeInk : C.muted }, `${d.month}月`),
    num({ fontSize: 30, color: fg, lineHeight: 1 }, d.day),
    text({ fontSize: 12, color: C.muted, marginTop: 1 }, d.weekday),
  ] : [text({ fontSize: 13, color: C.muted }, '待定')]);
}

function eventRow(e) {
  const [label, tone, dot] = STATUS[e.status] || [e.status, 'neutral', false];
  return card({ alignItems: 'center', gap: 14 }, [
    dateTile(e.scheduled_time, e.status === 'in_progress'),
    box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 7 }, [
      box({ alignItems: 'center', gap: 8, flexWrap: 'wrap' }, [eventTitle(e.name, { fontSize: 23 }), tag(label, tone, { dot })]),
      box({ gap: 6, flexWrap: 'wrap' }, eventTagList(e).map(([l, t]) => tag(l, t))),
      meta('clock', whenText(e.scheduled_time)),
    ]),
    box({ flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }, nextForEvent(e)),
  ]);
}

export function scheduleCard(s, now, assets = NO_ASSETS) {
  const events = s?.events || [];
  const host = assets.host || DEFAULT_SITE_HOST;
  const body = [];
  if (s?.now?.length) body.push(section('现在要做', `${s.now.length} 件`), ...s.now.map((i) => actionCard(i, host)));
  body.push(section('我的赛事', events.length ? `${events.length} 场未结束` : ''));
  if (events.length) {
    body.push(...events.map(eventRow));
    body.push(nextUp([['报名', '看还能报名的赛事'], ['战绩', '我的战绩']]));
  } else {
    body.push(empty('没有报名未结束的比赛', '按下面的步骤报名参加下一场'));
    body.push(stepper('怎么参加比赛', signupSteps({ player_id: s?.player_id, events: [] })));
  }
  return page({ iconName: 'calendar-days', title: '我的赛程', subtitle: `选手 ${s?.player_id ?? ''}` }, body, now, assets);
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
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.orange}" stop-opacity="0.25"/><stop offset="1" stop-color="${C.orange}" stop-opacity="0"/></linearGradient></defs>
<polygon points="${area}" fill="url(#g)"/>
<polyline points="${line}" fill="none" stroke="${C.orange}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5" fill="${C.orange}" stroke="#fff" stroke-width="2"/>
</svg>`),
  };
}

/** The ladder page's stat card: icon tile, label, value. */
const statTile = (iconName, label, value, { tone = 'brand', color = C.ink, sub = '' } = {}) => card({ alignItems: 'center', gap: 12, flexGrow: 1, flexBasis: 0, padding: '14px 14px' }, [
  iconTile(iconName, 40, tone),
  box({ flexDirection: 'column' }, [
    text({ fontSize: 13, color: C.muted }, label),
    box({ alignItems: 'baseline', gap: 4 }, [
      num({ fontSize: 30, color, lineHeight: 1.1 }, value),
      sub ? text({ fontSize: 12, color: C.faint }, sub) : null,
    ]),
  ]),
]);

function formChip(g) {
  return box({ flexDirection: 'column', alignItems: 'center', flexGrow: 1, flexBasis: 0, gap: 6 }, [
    num({ width: 46, height: 46, borderRadius: 12, background: g.won ? C.winSoft : C.lossSoft, color: g.won ? C.win : C.loss, fontSize: 25, alignItems: 'center', justifyContent: 'center' }, g.won ? 'W' : 'L'),
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
  const played = won + lost;
  const share = played ? won / played : 0;
  const rate = played ? `${Math.round(share * 100)}%` : '—';
  const name = p?.display_name || p?.id || '';
  const tier = ladder?.tier?.group && ladder.tier.group !== 'unrated' ? ladder.tier : null;
  const side = ladder ? box({ flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }, [
    box({ alignItems: 'center', gap: 6, background: TONES.info[0], borderRadius: 8, padding: '3px 10px 3px 6px' }, [
      tier ? img(assets.league(tier.group), 20, 20) : null,
      text({ fontSize: 13, fontWeight: 700, color: TONES.info[1] }, tier ? tier.name : (ladder.provisional ? '定级中' : '天梯')),
    ]),
    box({ alignItems: 'baseline', gap: 5 }, [
      num({ fontSize: 40, color: C.orangeInk, lineHeight: 1 }, Math.round(ladder.mmr ?? 0)),
      num({ fontSize: 15, fontWeight: 600, color: C.faint }, 'MMR'),
    ]),
  ]) : null;

  const body = [];
  if (!played && !(p?.tournaments_played)) {
    body.push(empty('还没有比赛记录', '参加一场比赛后，这里会显示胜负、冠亚军和天梯走势', cmd('报名', { main: true })));
  } else {
    body.push(card({ alignItems: 'center', gap: 22 }, [
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
        box({ height: 8, borderRadius: 999, background: played ? C.lossSoft : C.soft, overflow: 'hidden' }, [
          box({ width: `${Math.round(share * 100)}%`, height: 8, background: C.win }, []),
        ]),
        box({ justifyContent: 'space-between' }, [
          text({ fontSize: 14, color: C.muted }, `共 ${played} 场比赛`),
          text({ fontSize: 14, color: C.muted }, `小局 ${p?.maps_won || 0} : ${p?.maps_lost || 0}`),
        ]),
      ]),
    ]));
    body.push(box({ gap: 10 }, [
      statTile('trophy', '参赛', p?.tournaments_played || 0, { sub: '场' }),
      statTile('crown', '冠军', p?.championships || 0, { tone: 'prize', color: (p?.championships || 0) ? C.prize : C.ink }),
      statTile('medal', '亚军', p?.runner_ups || 0, { tone: 'neutral' }),
      statTile('swords', '天梯', ladder?.games ?? 0, { tone: 'info', sub: '局' }),
    ]));
  }
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
  body.push(nextUp([['战绩 选手名', '查其他选手'], ['赛程', '我的比赛']]));
  return page({
    iconName: null,
    title: name,
    titleLead: img(assets.flag(p?.flag || ladder?.flag), 40, 30, { borderRadius: 5 }),
    subtitle: p?.team ? `${p.team} · 全部赛事战绩` : '全部赛事战绩',
    side,
  }, body, now, assets);
}

// ---- 帮助 ----

export const HELP_GROUPS = [
  ['报名参赛', 'trophy', [
    ['报名', '正在报名的赛事和编号'],
    ['报名 1', '报名列表里的第 1 个赛事'],
    ['取消报名 1', '退出第 1 个赛事（报名截止前）'],
    ['签到', '开赛前 30 分钟开放，一次签到所有赛事'],
  ]],
  ['查询', 'calendar-days', [
    ['赛程', '我的比赛，以及现在要做的事'],
    ['战绩', '我的胜负、冠亚军和天梯'],
    ['战绩 选手名', '查其他选手'],
  ]],
  ['账号', 'at-sign', [
    ['绑定 123456', '绑定码在网站右上角铃铛 →「QQ 群提醒」'],
    ['解绑', '解除这个 QQ 的绑定'],
    ['状态', '机器人和网站是否在线'],
  ]],
];

export function helpCard(now, assets = NO_ASSETS) {
  const steps = signupSteps({ player_id: null, events: [] }).map((s) => ({ ...s, state: s.id === 'bind' ? 'current' : 'todo' }));
  const groups = HELP_GROUPS.map(([title, iconName, rows]) => card({ flexDirection: 'column', gap: 10 }, [
    box({ alignItems: 'center', gap: 8 }, [icon(iconName, 17, C.orangeInk), text({ fontSize: 16, fontWeight: 700 }, title)]),
    ...rows.map(([c, what]) => box({ alignItems: 'center', gap: 12 }, [
      box({ width: 168, flexShrink: 0 }, [cmd(c, { size: 14 })]),
      text({ fontSize: 14, color: C.muted, flexShrink: 1 }, what),
    ])),
  ]));
  return page({
    iconName: 'circle-question-mark',
    title: '机器人指令',
    subtitle: `在群里 ${BOT} 后发送；前面加不加 / 都可以`,
  }, [stepper('第一次参加？', steps, '按顺序来'), ...groups, discordRow('Potato Cup Discord 服务器')], now, assets);
}
