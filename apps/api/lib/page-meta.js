// Link previews for shared event links. The web app is one page for every
// route, so Discord / QQ / Telegram see the same "Potato Cup" for every
// link; for /tournament/:id the server writes the event's title and a short
// description into the page it returns (app.js, the SPA fallback).

const MODES = { ab: 'AB', rb: 'RB', sb: 'SB' };
const TYPES = { prop: '螺旋桨', 'legacy-jet': '早期喷气', 'top-jet': '顶级喷气', proleague: 'Pro League BVR' };
const FORMATS = { single_elim: '单败淘汰', double_elim: '双败淘汰', swiss: '瑞士轮' };
const STATUS = { voting: '时间投票中', registration: '报名中', in_progress: '比赛进行中', completed: '已结束' };
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** "2026/11/07 周六 22:00 北京时间" from the stored Beijing time, or "". */
export function beijingTimeLabel(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!m) return '';
  const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return `${m[1]}/${m[2]}/${m[3]} ${WEEKDAYS[day]} ${m[4]}:${m[5]} 北京时间`;
}

/** { title, description } of an event for link previews. */
export function eventMeta(t) {
  const format = t.playoff_format && t.format !== t.playoff_format
    ? `${FORMATS[t.format] || t.format} → ${FORMATS[t.playoff_format] || t.playoff_format}`
    : FORMATS[t.format] || '';
  const parts = [
    STATUS[t.status],
    beijingTimeLabel(t.scheduled_time),
    [MODES[t.game_mode], TYPES[t.vehicle_pool]].filter(Boolean).join(' '),
    format,
    t.player_count ? `${t.player_count} 名选手` : '',
  ].filter(Boolean);
  return { title: `${t.name} · Potato Cup`, description: parts.join(' · ') };
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The page with `meta` ({ title, description, url, image }) as its <title>
 * and Open Graph / Twitter tags (placed before </head>).
 */
export function injectMeta(html, meta) {
  const tags = [
    ['og:type', 'website'],
    ['og:site_name', 'Potato Cup'],
    ['og:title', meta.title],
    ['og:description', meta.description],
    ['og:url', meta.url],
    ['og:image', meta.image],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<meta property="${k}" content="${escapeHtml(v)}" />`);
  tags.push('<meta name="twitter:card" content="summary_large_image" />', '<meta name="theme-color" content="#f59e0b" />');
  if (meta.description) tags.push(`<meta name="description" content="${escapeHtml(meta.description)}" />`);
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
  out = out.replace('</head>', `${tags.join('\n')}\n</head>`);
  return out;
}

/** The event id of a page path (/tournament/:id, not its overlay or console), or null. */
export function eventIdOfPath(path) {
  const m = /^\/tournament\/([^/?#]+)\/?(?:[?#].*)?$/.exec(String(path || ''));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
