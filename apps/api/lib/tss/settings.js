// Export settings for a TSS tournament (axsuck.tss_exports.settings): what
// TSS cannot tell (page title, series, Liquipedia tier) and how much of the
// event goes on the page. normalizeTssSettings accepts anything and returns
// a complete, bounded object, so the route can store what it gets.

const text = (v, max = 200) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const int = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

export const OPPONENTS = ['auto', 'team', 'literal', 'solo'];
export const SECTIONS = ['format', 'prize', 'maps', 'participants', 'results', 'description', 'trailer'];
const SECTION_DEFAULTS = { format: true, prize: true, maps: true, participants: true, results: true, description: false, trailer: true };

// Settings a new event takes over from the last saved one of the same kind.
const CARRIED = ['series', 'tier', 'tiertype', 'opponent', 'qualifiers', 'participantsTop', 'rosters', 'goldenEagles', 'cleanNames', 'exactTimes', 'timeField', 'lang', 'sections'];

export function defaultTssSettings(previous = null) {
  const base = {
    title: '',
    series: '',
    tier: '',
    tiertype: '',
    opponent: 'auto',
    qualifiers: 0,
    participantsTop: 0,
    rosters: true,
    goldenEagles: true,
    cleanNames: true,
    startRound: 0,
    filter: { by: 'seq', ranges: '' },
    exactTimes: true,
    timeField: 'invite',
    lang: 'EN',
    standingsBg: '',
    sections: { ...SECTION_DEFAULTS },
  };
  if (!previous) return base;
  const prev = normalizeTssSettings(previous);
  for (const k of CARRIED) base[k] = prev[k];
  return base;
}

export function normalizeTssSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const sections = {};
  for (const k of SECTIONS) sections[k] = bool(s.sections?.[k], SECTION_DEFAULTS[k]);
  return {
    title: text(s.title),
    series: text(s.series),
    tier: text(s.tier, 10),
    tiertype: text(s.tiertype, 40),
    opponent: oneOf(s.opponent, OPPONENTS, 'auto'),
    qualifiers: int(s.qualifiers, 0, 64, 0),
    participantsTop: int(s.participantsTop, 0, 256, 0),
    rosters: bool(s.rosters, true),
    goldenEagles: bool(s.goldenEagles, true),
    cleanNames: bool(s.cleanNames, true),
    startRound: int(s.startRound, 0, 20, 0),
    filter: {
      by: oneOf(s.filter?.by, ['seq', 'id'], 'seq'),
      ranges: text(s.filter?.ranges, 300),
    },
    exactTimes: bool(s.exactTimes, true),
    timeField: oneOf(s.timeField, ['invite', 'start'], 'invite'),
    lang: oneOf(s.lang, ['EN', 'RU'], 'EN'),
    standingsBg: text(s.standingsBg, 200),
    sections,
  };
}
