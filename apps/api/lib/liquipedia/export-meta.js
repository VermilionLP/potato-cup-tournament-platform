// Per-event settings of the Liquipedia export (tournaments.wiki_meta):
// what the event data cannot tell — page names, tier, prize money, broadcast
// talent, streams. Everything else (format, points, players, results) comes
// from the event itself.

const text = (v, max = 200) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const lines = (v, max = 4000) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const bestOf = (v) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isInteger(n) && n >= 1 && n <= 15 && n % 2 === 1 ? n : null;
};

export const CURRENCIES = ['cny', 'usd'];
export const TALENT_POSITIONS = ['Host', 'Commentator', 'Caster', 'Observer', 'Producer', 'Analyst'];

// Broadcast defaults from the 2026 cup pages (Potato Cup/2026/Aug/Asia_Pacific).
export const DEFAULT_TALENTS = [
  { position: 'Host', lang: 'English', people: [{ name: 'Vermilion', flag: '' }] },
  {
    position: 'Commentator',
    lang: 'Chinese',
    people: [
      { name: 'Vermilion', flag: '' },
      { name: 'Zero8apple', flag: 'cn' },
      { name: '隐居寒天', flag: 'cn' },
      { name: 'KATO Megumi', flag: 'cn' },
      { name: 'Avı Physıcα', flag: 'cn' },
    ],
  },
  { position: 'Commentator', lang: 'Russian', people: [{ name: 'RussianShark_', flag: '' }] },
];
export const DEFAULT_STREAMS = '|lang1=cn |bilibili1=1291756|2bilibili1=15015|3bilibili1=4997883|4bilibili1=23501214\n|lang2=ru |twitch2=russian_shark_';

// Prize money (CNY) and Golden Eagles by event kind, from the reference pages.
const DEFAULT_PRIZES = {
  weekly: [
    { place: '1', localprize: '136', freetext: '' },
    { place: '2', localprize: '49', freetext: '' },
    { place: '3-4', localprize: '8', freetext: '' },
  ],
  monthly: [
    { place: '1', localprize: '374', freetext: '10000' },
    { place: '2', localprize: '187', freetext: '5000' },
    { place: '3', localprize: '119', freetext: '2500' },
    { place: '4', localprize: '98', freetext: '2000' },
    { place: '5-6', localprize: '49', freetext: '1000' },
    { place: '7-8', localprize: '49', freetext: '1000' },
  ],
};

/** "1", "3-4" or "" for a place label. */
export function normalizePlace(value) {
  const m = /^\s*(\d{1,3})\s*(?:[-–~]\s*(\d{1,3}))?\s*$/.exec(String(value ?? ''));
  if (!m) return '';
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  if (from < 1 || to < from) return '';
  return from === to ? String(from) : `${from}-${to}`;
}

const flag = (v) => String(v ?? '').trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 20);

/** Cleans settings sent by the web app; unknown keys are dropped. */
export function normalizeWikiMeta(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const bo = m.bestOf && typeof m.bestOf === 'object' ? m.bestOf : {};
  const q = m.qualifies && typeof m.qualifies === 'object' ? m.qualifies : {};
  const prizes = (Array.isArray(m.prizes) ? m.prizes : [])
    .map((p) => ({
      place: normalizePlace(p?.place),
      localprize: text(p?.localprize, 12).replace(/[^\d.]/g, ''),
      freetext: text(p?.freetext, 30),
    }))
    .filter((p) => p.place)
    .slice(0, 32);
  const talents = (Array.isArray(m.talents) ? m.talents : [])
    .map((g) => ({
      position: text(g?.position, 30) || 'Commentator',
      lang: text(g?.lang, 30),
      people: (Array.isArray(g?.people) ? g.people : [])
        .map((p) => ({ name: text(p?.name, 60).replace(/[|{}[\]]/g, ''), flag: flag(p?.flag) }))
        .filter((p) => p.name)
        .slice(0, 20),
    }))
    .filter((g) => g.people.length)
    .slice(0, 12);
  return {
    name: text(m.name, 120),
    tickername: text(m.tickername, 60),
    tier: ['1', '2', '3', '4', '5'].includes(String(m.tier)) ? String(m.tier) : '',
    tiertype: text(m.tiertype, 30),
    server: text(m.server, 30),
    prizepool: text(m.prizepool, 12).replace(/[^\d.]/g, ''),
    currency: CURRENCIES.includes(m.currency) ? m.currency : 'cny',
    web: text(m.web, 300),
    bracketUrl: text(m.bracketUrl, 300),
    previous: text(m.previous, 120),
    next: text(m.next, 120),
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(String(m.endDate || '')) ? m.endDate : '',
    bestOf: { group: bestOf(bo.group), playoff: bestOf(bo.playoff), final: bestOf(bo.final) },
    notes: lines(m.notes, 2000),
    prizes,
    freetextName: text(m.freetextName, 30),
    qualifies: {
      name: text(q.name, 80),
      link: text(q.link, 160),
      places: String(q.places ?? '')
        .split(/[,，\s]+/)
        .map(normalizePlace)
        .filter(Boolean)
        .join(','),
    },
    streams: lines(m.streams, 2000),
    talents,
    vods: lines(m.vods, 2000),
  };
}

/**
 * Settings for an event without saved ones: broadcast talent and streams
 * carried over from the last event that has them (`previous`, raw
 * wiki_meta), else the defaults; prize money by event kind.
 */
export function defaultWikiMeta(t, previous = null) {
  const prev = previous ? normalizeWikiMeta(previous) : null;
  const kind = t?.points_kind === 'monthly' ? 'monthly' : 'weekly';
  const sameKind = previous && previous.__kind === kind;
  return normalizeWikiMeta({
    server: prev?.server || 'Europe',
    currency: kind === 'monthly' ? 'usd' : 'cny',
    prizepool: kind === 'monthly' ? '100' : '200',
    prizes: sameKind && prev.prizes.length ? prev.prizes : DEFAULT_PRIZES[kind],
    freetextName: sameKind ? prev.freetextName : kind === 'monthly' ? 'Golden Eagle' : '',
    qualifies: t?.points_invite ? { name: '', link: '', places: '1' } : {},
    streams: prev?.streams || DEFAULT_STREAMS,
    talents: prev?.talents?.length ? prev.talents : DEFAULT_TALENTS,
    vods: prev?.vods || '',
  });
}
