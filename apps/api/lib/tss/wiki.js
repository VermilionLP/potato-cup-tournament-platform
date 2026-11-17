// Liquipedia War Thunder wiki page for a TSS tournament (tss.warthunder.com),
// in the layouts of the existing pages:
//   team double elimination  War_Thunder_Championships_Series/Season/2026/Challenger_League/Major/III/Open_Qualifier/I (TSS 25849)
//   1v1 single elimination   Jet_Duel_RB/1x1/2025/Weekly/48 (TSS 23359)
//   Swiss                    TSS/Season_2026/The_Dino_Labs/4v4_RB (TSS 24850)
// Pure: the route loads the TSS data (lib/tss/client.js) and passes it in.
//
// TSS data notes:
// - a bracket is { winner: { Winner: [rounds], Final: [[gf]] }, loser: { Looser, LooserFinal, Semifinal } };
//   each round is a list of matches { id, typeBracket, teamA, teamB, winner, realNameA/B, idTeamA/B, scoreA/B, matchResult }
//   (matchResult 0 with a winner = decided without a played series)
// - the lower bracket's rounds are Looser, then LooserFinal and Semifinal (the lower final)
// - reward "place" N is the N-th elimination stage, not a final rank: in single elimination 3 = both semifinal losers (3-4)
// - dateBattle.playOffTime has a slot per round (double elimination: upper round j -> j, lower round i -> i + 1)

import { doubleElimTemplate, wikiId } from '../liquipedia/export.js';

// ------------------------------------------------------------------ helpers

const parseMaybe = (v) => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};
/** Escapes text for a named template parameter or a table cell. */
export const esc = (s) => String(s ?? '').replace(/\|/g, '&#124;').replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;').replace(/\[\[/g, '&#91;&#91;').trim();
/** As esc, for positional parameters ({{Opponent|name}}), where "=" breaks too. */
const escPos = (s) => esc(s).replace(/=/g, '&#61;');
const pad = (n) => String(n).padStart(2, '0');

/** "2026-09-19" (UTC) from TSS unix seconds. */
export function tssDay(unix) {
  if (!unix || unix === '0') return '';
  const d = new Date(Number(unix) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** "2026-09-19 19:15 {{abbr/UTC}}" from TSS unix seconds. */
export function tssTime(unix) {
  const day = tssDay(unix);
  if (!day) return '';
  const d = new Date(Number(unix) * 1000);
  return `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} {{abbr/UTC}}`;
}

/** TSS team names use "_" for spaces and "[warning]" where its word filter hit. */
export function cleanTeamName(s) {
  return String(s || '')
    .replace(/\[warning\]/gi, ' ')
    .replace(/(?<=[^_\s])_(?=[^_\s])/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Golden Eagles in a TSS reward text ("500  (GE), 50% RP Booster ...") or ''. */
export function goldenEagles(reward) {
  const m = /(\d[\d\s]*)\s*\(GE\)/.exec(String(reward || ''));
  return m ? m[1].replace(/\s/g, '') : '';
}

/** TSS BBCode ([b], [br], [url=...]) to wiki text, a paragraph per line. */
export function bbToWiki(s) {
  if (!s) return '';
  let t = String(s).replace(/\r/g, '').replace(/\\n/g, '\n')
    .replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  t = t.replace(/\[br\]\s*\n?/gi, '\n').replace(/\[b\]\s*\[\/b\]/gi, '');
  t = t.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, (_, x) => x.split('\n').map((l) => (l.trim() ? `'''${l.trim()}'''` : '')).join('\n'));
  t = t.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "''$1''").replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>');
  t = t.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '[$1 $2]').replace(/\[url\]([\s\S]*?)\[\/url\]/gi, '$1');
  t = t.replace(/\[img\][\s\S]*?\[\/img\]/gi, '').replace(/\[\/?(b|i|u|s|color|size|center|left|right|quote|list|\*)[^\]]*\]/gi, '');
  return t.split('\n').map((l) => l.trim()).filter(Boolean).join('\n\n');
}

const VEHICLES = { tank: 'Ground', tanks: 'Ground', ground: 'Ground', air: 'Aviation', aircraft: 'Aviation', aviation: 'Aviation', heli: 'Helicopter', helicopter: 'Helicopter', ship: 'Naval', ships: 'Naval', naval: 'Naval', fleet: 'Naval' };
const VEHICLE_WORDS = { Ground: 'Tank', Aviation: 'Air', Naval: 'Naval', Helicopter: 'Helicopter' };
const SERVERS = { EU: 'Europe', NA: 'North America', RU: 'Russia', ASIA: 'Asia', SA: 'South America', AU: 'Oceania' };
export const TYPES = { 'single-elumination': 'single', 'double-elumination': 'double', swiss: 'swiss' };

function vehicleOf(data) {
  const g = String(data.statGroup || '').toLowerCase();
  if (VEHICLES[g]) return VEHICLES[g];
  const n = `${data.detail.nameEN || ''} ${data.detail.descriptionTournamentEN || ''}`.toLowerCase();
  if (/tank|ground/.test(n)) return 'Ground';
  if (/heli/.test(n)) return 'Helicopter';
  if (/naval|fleet|ship/.test(n)) return 'Naval';
  if (/\bair\b|jet|plane|aviation/.test(n)) return 'Aviation';
  return '';
}

/** RB / AB / SB, with "m" (mixed nations in one team) for team events or when TSS says so. */
export function modeOf(d) {
  const txt = `${d.nameEN || ''} ${d.tournamentNameShort || ''} ${d.descriptionTournamentEN || ''}`;
  const hits = txt.match(/\b([ARS]B)(m?)\b/g) || [];
  const base = (hits[0] || '').slice(0, 2) || d.gameMode || ({ arcade: 'AB', realistic: 'RB', simulator: 'SB', hardcore: 'SB' }[d.difficulty] || '');
  const nations = String(d.countryTeamA || '').split(',').filter((s) => s.trim()).length;
  const team = Number(d.teamSize || d.maxTeamSize || 1) > 1;
  const mixed = hits.some((h) => h.endsWith('m')) || (team && nations > 1);
  return base && mixed ? `${base}m` : base;
}

const teamSizeOf = (d) => Number(d.teamSize || d.maxTeamSize || 1) || 1;
const teamsOf = (d) => (Array.isArray(parseMaybe(d.listTeams)) ? parseMaybe(d.listTeams) : []);

// ---------------------------------------------------------------- opponents

function opponents(data, settings) {
  const d = data.detail;
  const byId = new Map(teamsOf(d).map((t) => [String(t.idTeam), t]));
  const solo = settings.opponent === 'solo' || (settings.opponent === 'auto' && teamSizeOf(d) === 1);
  const tidy = (s) => (settings.cleanNames === false ? String(s || '') : cleanTeamName(s));
  // 1v1: the player (the "team" captain); teams: the team name.
  const nameOf = (idTeam, realName) => {
    const t = byId.get(String(idTeam));
    if (solo && t?.nickCaptain) return t.nickCaptain;
    return tidy(realName || t?.teamName || '');
  };
  const tpl = settings.opponent === 'literal' ? 'LiteralOpponent' : 'TeamOpponent';
  const opp = (idTeam, realName, score) => {
    const n = realName || idTeam ? escPos(nameOf(idTeam, realName)) : '';
    const sc = score === undefined || score === null || score === '' ? '' : `|score=${score}`;
    return solo ? `{{SoloOpponent|p1=${n}${sc}}}` : `{{${tpl}|${n}${sc}}}`;
  };
  return { solo, nameOf, opp, tidy, byId };
}

const hasA = (m) => Boolean(m.realNameA || m.idTeamA);
const hasB = (m) => Boolean(m.realNameB || m.idTeamB);
const winnerSide = (m) => (m.winner ? (m.winner === m.teamA ? 1 : m.winner === m.teamB ? 2 : 0) : 0);

/**
 * One {{Match}}. Teams (the WTCS pages): bestof, date, finished, winner and
 * the scores. 1v1 (the weekly pages): bestof, date and the scores, a result
 * decided without playing as W / FF. A bye keeps an empty opponent.
 */
function matchText(m, O, ctx, notes) {
  const own = ctx.mtimes?.[String(m.id)];
  const date = own ? ctx.fmt(own) : ctx.date || '';
  const both = hasA(m) && hasB(m);
  const w = winnerSide(m);
  if (both && !w && ctx.past) notes.noWinner += 1;
  const note = both && !w && ctx.past ? ' <!-- no winner on TSS -->' : '';
  if (O.solo) {
    let s1 = m.scoreA;
    let s2 = m.scoreB;
    if (!both || (!w && !ctx.past)) {
      s1 = '';
      s2 = '';
    } else if (w && Number(m.matchResult) === 0) {
      s1 = w === 1 ? 'W' : 'FF';
      s2 = w === 1 ? 'FF' : 'W';
    }
    return ['{{Match', `    |bestof=${ctx.bestof}`, `    |date=${date}`, `    |opponent1=${O.opp(m.idTeamA, m.realNameA, s1)}`, `    |opponent2=${O.opp(m.idTeamB, m.realNameB, s2)}`, `}}${note}`].join('\n');
  }
  const scored = both && (w || ctx.past);
  const technical = both && w && Number(m.matchResult) === 0 ? ' <!-- technical result on TSS -->' : '';
  return [
    '{{Match',
    `    |bestof=${ctx.bestof}`,
    `    |date=${date}`,
    `    |finished=${both && w ? 'true' : ''}`,
    `    |winner=${both && w ? w : ''}`,
    `    |opponent1=${O.opp(m.idTeamA, m.realNameA, scored ? m.scoreA : '')}`,
    `    |opponent2=${O.opp(m.idTeamB, m.realNameB, scored ? m.scoreB : '')}`,
    `}}${note || technical}`,
  ].join('\n');
}

// --------------------------------------------------------- bracket structure

/**
 * The TSS bracket as upper rounds (single elimination: every round up to
 * the final), lower rounds (Looser, LooserFinal, Semifinal) and the grand
 * final, with a number (#) per match in that order.
 */
export function bracketStructure(data) {
  const b = data.bracket || {};
  const de = data.detail.typeTournament === 'double-elumination';
  const W = b.winner?.Winner || [];
  const gf = [].concat(...(b.winner?.Final || []));
  const ub = de ? W : W.concat(gf.length ? [gf] : []);
  const lb = de ? [...(b.loser?.Looser || []), [].concat(...(b.loser?.LooserFinal || [])), [].concat(...(b.loser?.Semifinal || []))].filter((r) => r.length) : [];
  const extra = [];
  if (!de) {
    for (const key of Object.keys(b.winner || {}).filter((k) => !['Winner', 'Final'].includes(k))) {
      const ms = [].concat(...(b.winner[key] || []));
      if (ms.length) extra.push({ key, third: /bronze|third|3/i.test(key), matches: ms });
    }
  }
  const all = [];
  let seq = 0;
  const add = (m, stage) => {
    seq += 1;
    all.push({ m, seq, stage });
  };
  ub.forEach((r, i) => r.forEach((m) => add(m, de ? { side: 'upper', round: i + 1 } : { side: 'round', round: i + 1, of: ub.length })));
  lb.forEach((r, i) => r.forEach((m) => add(m, { side: 'lower', round: i + 1 })));
  if (de) gf.forEach((m) => add(m, { side: 'final' }));
  extra.forEach((e) => e.matches.forEach((m) => add(m, { side: 'extra', key: e.key })));
  const seqOf = new Map(all.map((x) => [x.m, x.seq]));
  return { de, ub, lb, gf: de ? gf : [], extra, all, seqOf };
}

/** "49-63, 1-8, 60-" -> [[49, 63], [1, 8], [60, Infinity]]; throws on anything else. */
export function parseRanges(str) {
  const out = [];
  for (const part of String(str || '').split(/[,，;；\s]+/).filter(Boolean)) {
    const m = /^(\d+)?\s*[-~～]\s*(\d+)?$/.exec(part);
    if (m && (m[1] || m[2])) out.push([m[1] ? Number(m[1]) : -Infinity, m[2] ? Number(m[2]) : Infinity]);
    else if (/^\d+$/.test(part)) out.push([Number(part), Number(part)]);
    else throw Object.assign(new Error(`看不懂比赛范围「${part}」，请写成 49-63、1-8 或 60- 这样`), { code: 'BAD_RANGE' });
  }
  return out;
}

function matchFilter(settings, S) {
  const ranges = parseRanges(settings.filter?.ranges);
  if (!ranges.length) return null;
  const key = settings.filter?.by === 'id' ? (m) => Number(m.id) : (m) => S.seqOf.get(m);
  return (m) => ranges.some(([a, b]) => key(m) >= a && key(m) <= b);
}

/**
 * Upper round (0-based) the exported bracket starts at: the setting, else
 * the earliest round with a selected match (double elimination: lower round
 * i needs upper round floor(i / 2)).
 */
function startRound(S, settings, keep) {
  if (settings.startRound) return Math.max(0, Math.min(S.ub.length - 1, settings.startRound - 1));
  if (!keep) return 0;
  let r = S.ub.findIndex((round) => round.some(keep));
  if (r < 0) r = S.ub.length - 1;
  if (S.de) {
    const li = S.lb.findIndex((round) => round.some(keep));
    if (li >= 0) r = Math.min(r, Math.floor(li / 2));
  }
  return Math.max(0, r);
}

/** The bracket matches the page will show (for loading their times). */
export function exportedMatches(data, settings) {
  if (!data.bracket) return [];
  const S = bracketStructure(data);
  const keep = matchFilter(settings, S);
  const r0 = startRound(S, settings, keep);
  const ms = [].concat(...S.ub.slice(r0), ...(S.de ? S.lb.slice(2 * r0) : []), S.gf, ...S.extra.map((e) => e.matches));
  return ms.filter((m) => (!keep || keep(m)) && hasA(m) && hasB(m));
}

const roundTitle = (left) => (left === 1 ? 'Final' : left === 2 ? 'Semifinals' : left === 3 ? 'Quarterfinals' : `Round of ${2 ** left}`);
const upperTitle = (j, n) => ({ 1: 'Upper Bracket Final', 2: 'Upper Bracket Semifinals', 3: 'Upper Bracket Quarterfinals' }[n - j] || `Upper Bracket Round ${j + 1}`);
const lowerTitle = (i, n) => ({ 1: 'Lower Bracket Final', 2: 'Lower Bracket Semifinals', 3: 'Lower Bracket Quarterfinals', 4: 'Lower Bracket Quarterfinals' }[n - i] || `Lower Bracket Round ${i + 1}`);

function singleBracket(data, O, settings, ctxBase, notes) {
  const S = bracketStructure(data);
  if (!S.ub.length) return '';
  const keep = matchFilter(settings, S);
  const r0 = startRound(S, settings, keep);
  const d = data.detail;
  const times = d.dateBattle?.playOffTime || [];
  const fmt = O.solo ? tssDay : tssTime; // 1v1 weekly pages give the day only
  const finish = O.solo && ctxBase.past ? '|finish=true' : '';
  const lines = [`{{Bracket|Bracket/${S.ub[r0].length * 2}|id=${wikiId(`tss-${data.id}`, `se${r0}`)}${finish}`];
  S.ub.slice(r0).forEach((round, j) => {
    const full = j + r0;
    const last = full === S.ub.length - 1;
    const date = fmt(last && d.dateBattle?.final ? d.dateBattle.final : times[full]);
    lines.push('', `<!-- ${last && O.solo ? 'Grand Final' : roundTitle(S.ub.length - full)} -->`);
    round.forEach((m, k) => {
      if (keep && !keep(m)) notes.filtered += 1;
      else lines.push(`|R${j + 1}M${k + 1}=${matchText(m, O, { ...ctxBase, date, fmt }, notes)}`);
    });
  });
  for (const e of S.extra) {
    const ms = e.matches.filter((m) => !keep || keep(m));
    if (e.third && ms.length) lines.push('', '<!-- Third Place Match -->', `|RxMTP=${matchText(ms[0], O, { ...ctxBase, date: fmt(d.dateBattle?.final), fmt }, notes)}`);
  }
  lines.push('}}');
  notes.startRound = r0;
  return lines.join('\n');
}

/**
 * Liquipedia double elimination (Bracket/{N}U{N/2}L…1D): upper round j in
 * column (j = 0 ? 1 : 2j), lower round i in column i + 1, the grand final
 * after them; in a column the upper matches are numbered first. Starting at
 * upper round r leaves out lower rounds 1..2r as well.
 */
function doubleBracket(data, O, settings, ctxBase, notes) {
  const S = bracketStructure(data);
  const keep = matchFilter(settings, S);
  const r0 = startRound(S, settings, keep);
  const ub = S.ub.slice(r0);
  const lb = S.lb.slice(2 * r0);
  if (!ub.length) return '';
  if (lb.length !== 2 * (ub.length - 1) || ub[0].length < 2) {
    notes.shape = true;
    return '';
  }
  const d = data.detail;
  const times = d.dateBattle?.playOffTime || [];
  const fmt = O.solo ? tssDay : tssTime;
  const colUpper = (j) => (j === 0 ? 1 : 2 * j);
  const lines = [`{{Bracket|${doubleElimTemplate(ub[0].length * 2).name}|id=${wikiId(`tss-${data.id}`, `de${r0}`)}`];
  const upperInColumn = new Map(ub.map((r, j) => [colUpper(j), r.length]));
  const emit = (round, col, offset, title, date) => {
    lines.push('', `<!-- ${title} -->`);
    round.forEach((m, k) => {
      if (keep && !keep(m)) notes.filtered += 1;
      else lines.push(`|R${col}M${offset + k + 1}=${matchText(m, O, { ...ctxBase, date, fmt }, notes)}`);
    });
  };
  ub.forEach((r, j) => emit(r, colUpper(j), 0, upperTitle(j, ub.length), fmt(times[j + r0])));
  lb.forEach((r, i) => emit(r, i + 1, upperInColumn.get(i + 1) || 0, lowerTitle(i, lb.length), fmt(times[i + 2 * r0 + 1])));
  if (S.gf.length) emit(S.gf, 2 * (ub.length - 1) + 1, 0, 'Grand Final', fmt(d.dateBattle?.final));
  lines.push('}}');
  notes.startRound = r0;
  return lines.join('\n');
}

// --------------------------------------------------------------- placements

/**
 * Placement groups from a finished bracket, one per elimination stage:
 * { stage, place, who: [[idTeam, realName]] }. TSS reward "place" N is
 * stage N. Null until the grand final has a winner.
 */
export function placements(data) {
  const b = data.bracket;
  const gf = b?.winner?.Final?.[0]?.[0];
  if (!gf?.winner) return null;
  const loser = (m) => (m.winner === m.teamA ? [m.idTeamB, m.realNameB] : [m.idTeamA, m.realNameA]);
  const winner = (m) => (m.winner === m.teamA ? [m.idTeamA, m.realNameA] : [m.idTeamB, m.realNameB]);
  const res = [{ stage: 1, place: '1', who: [winner(gf)] }, { stage: 2, place: '2', who: [loser(gf)] }];
  const seen = new Set([String(winner(gf)[0]), String(loser(gf)[0])]);
  const losersOf = (ms) => ms.filter((m) => m.winner && hasA(m) && hasB(m)).map(loser)
    .filter((w) => !seen.has(String(w[0])) && seen.add(String(w[0])));
  const de = data.detail.typeTournament === 'double-elumination';
  const rounds = de
    ? [[].concat(...(b.loser?.Semifinal || [])), [].concat(...(b.loser?.LooserFinal || [])), ...(b.loser?.Looser || []).slice().reverse()]
    : (b.winner?.Winner || []).slice().reverse();
  let next = 3;
  rounds.forEach((ms, i) => {
    const n = ms.length; // a round knocks out one team per match
    if (!n) return;
    res.push({ stage: i + 3, place: n === 1 ? String(next) : `${next}-${next + n - 1}`, who: losersOf(ms) });
    next += n;
  });
  return res;
}

/** Placement labels without results: in single elimination stage k >= 3 is 2^(k-2)+1 .. 2^(k-1). */
function stageLabel(k, single) {
  if (k <= 2 || !single) return String(k);
  return `${2 ** (k - 2) + 1}-${2 ** (k - 1)}`;
}

function prizeStages(data) {
  const rewards = parseMaybe(data.detail.rewards) || {};
  const rewardOf = (stage) => Object.values(rewards).find((x) => String(x.place) === String(stage))?.reward || '';
  const places = placements(data);
  if (places) return places.map((p) => ({ ...p, reward: rewardOf(p.stage) }));
  const single = data.detail.typeTournament === 'single-elumination';
  return Object.values(rewards).map((r) => Number(r.place)).filter((n) => n > 0).sort((a, b) => a - b)
    .map((k) => ({ stage: k, place: stageLabel(k, single), who: [], reward: rewardOf(k) }));
}

// ------------------------------------------------------------------- blocks

function infoboxTeam(data, settings) {
  const d = data.detail;
  const discord = (/discord\.gg\/([\w-]+)/.exec(String(d.discussion_EN || d.discussion || '')) || [])[1] || '';
  const url = tssUrl(data.id);
  return [
    '{{Infobox league',
    `|name=${esc(settings.title || d.nameEN || d.tournamentNameShort)}`,
    '|image=', '|icon=', '|imagedark=', '|icondark=',
    `|series=${esc(settings.series)}`,
    '|tickername=',
    '|organizer=Gaijin',
    '|sponsor=',
    '|type=Online',
    '|country=world',
    `|liquipediatier=${esc(settings.tier)}|liquipediatiertype=${esc(settings.tiertype)}`,
    `|sdate=${tssDay(d.dateStartTournament)}`,
    `|edate=${tssDay(d.dateEndTournament)}`,
    `|mode=${modeOf(d)}`,
    `|vehicle=${vehicleOf(data)}`,
    '|website=https://tss.warthunder.com/index.php',
    `|rulebook=${url}#info-regulation_info`,
    '|twitch=', '|twitter=', '|youtube=', '|instagram=', '|tiktok=',
    `|discord=${esc(discord)}`,
    `|bracket=${url}`,
    '}}',
  ].join('\n');
}

function infoboxSolo(data, settings) {
  const d = data.detail;
  const s = tssDay(d.dateStartTournament);
  const e = tssDay(d.dateEndTournament);
  const size = teamSizeOf(d);
  return [
    '{{Infobox league',
    `|name=${esc(settings.title || d.nameEN || d.tournamentNameShort)}`,
    '|image=', '|icon=',
    `|series=${esc(settings.series || d.tournamentNameShort || d.nameEN)}`,
    '|abbreviation=',
    '|tickername=',
    '|organizer=Gaijin',
    '|sponsor=Gaijin',
    `|server=${esc(SERVERS[d.cluster] || d.cluster || '')}`,
    '|type=Online',
    `|format=${size}v${size}`,
    `|mode=${modeOf(d)}`,
    `|vehicle=${vehicleOf(data)}`,
    ...(s && s === e ? [`|date=${s}`] : [`|sdate=${s}`, `|edate=${e}`]),
    `|liquipediatier=${esc(settings.tier)} |liquipediatiertype=${esc(settings.tiertype)}`,
    `|bracket=${tssUrl(data.id)}`,
    '}}',
  ].join('\n');
}

function formatBlock(data, solo) {
  const d = data.detail;
  if (solo) {
    const type = { 'single-elumination': 'Single-elimination Bracket:', 'double-elumination': 'Double-elimination Bracket:', swiss: 'Swiss System:' }[d.typeTournament] || d.typeTournament;
    return [`* ${type}`, ...(d.amountBattles ? [`* All matches are Bo${d.amountBattles}.`] : [])].join('\n');
  }
  const type = { 'single-elumination': 'Single Elimination Bracket', 'double-elumination': 'Double Elimination Bracket', swiss: 'Swiss System' }[d.typeTournament] || d.typeTournament;
  const size = teamSizeOf(d);
  return [
    d.needKey ? '* Invite / ticket only' : '* Open Participation',
    '',
    `*  ${type}`,
    ...(d.amountBattles ? [`** All stages are {{Abbr/Bo${d.amountBattles}}}.`] : []),
    `** ${[VEHICLE_WORDS[vehicleOf(data)], modeOf(d)].filter(Boolean).join(' ')}`,
    `** ${size}v${size}`,
    ...(d.maxRespawns && d.maxRespawns !== '0' ? [`** ${d.maxRespawns} Spawns`] : []),
  ].join('\n');
}

/** 1v1: {{SoloPrizePool|freetext1=Golden Eagle |{{Slot|place=1|freetext1=500}} …}}; places with other rewards only, without freetext. */
function prizeSolo(data) {
  const stages = prizeStages(data).filter((s) => s.reward);
  const out = ['{{SoloPrizePool|freetext1=Golden Eagle'];
  for (const s of stages) {
    const ge = goldenEagles(s.reward);
    out.push(`|{{Slot|place=${s.place}${ge ? `|freetext1=${ge}` : ''}}}`);
  }
  out.push('}}');
  return out.join('\n');
}

/** Teams: the same with the teams of each place and the qualification marks. */
function prizeTeam(data, O, settings) {
  const q = settings.qualifiers;
  const qualifies = (s) => q && Number(String(s.place).split('-')[0]) <= q;
  const stages = prizeStages(data).filter((s) => s.reward || qualifies(s));
  const ge = settings.goldenEagles && stages.some((s) => goldenEagles(s.reward));
  const out = [`{{TeamPrizePool|prizesummary=0|cutafter=8${ge ? '|freetext1=Golden Eagle' : ''}`];
  if (q) out.push('|qualifies1=|qualifies1name=');
  const opp = (name, qual) => `{{Opponent|${escPos(name)}${qual ? '|qualified1=true' : ''}}}`;
  for (const s of stages) {
    const extra = ge && goldenEagles(s.reward) ? `|freetext1=${goldenEagles(s.reward)}` : '';
    const opps = s.who.length ? s.who.map((w) => opp(O.nameOf(w[0], w[1]), qualifies(s))) : [opp('', qualifies(s))];
    out.push(`|{{Slot|place=${s.place}${extra}|${opps.join('|')}}}`);
  }
  out.push('}}');
  return out.join('\n');
}

function mapPool(data) {
  const names = (parseMaybe(data.detail.allLocations) || [])
    .map((l) => String(l?.name || '').replace(/\\n/g, '\n').replace(/\[[^\]]*\]\s*\n?/g, '').trim())
    .filter(Boolean);
  const unique = [...new Set(names)];
  if (!unique.length) return '';
  return ['{{MapPoolTable', '|size=x150px', ...unique.map((m, i) => `|map${i + 1}=${esc(m)}|map${i + 1}displayName=`), '}}'].join('\n');
}

/** Teams for the participants list: by placement first, then as TSS lists them. */
export function participantTeams(data, settings) {
  const list = teamsOf(data.detail);
  const byId = new Map(list.map((t) => [String(t.idTeam), t]));
  const placed = [];
  for (const p of placements(data) || []) for (const w of p.who) if (byId.has(String(w[0]))) placed.push(byId.get(String(w[0])));
  const rest = list.filter((t) => !placed.includes(t));
  return settings.participantsTop ? placed.slice(0, settings.participantsTop) : placed.concat(rest);
}

function participantsTeam(data, O, settings) {
  const teams = participantTeams(data, settings);
  if (!teams.length) return null;
  const out = ['{{TeamParticipants'];
  for (const t of teams) {
    const roster = data.rosters?.[String(t.idTeam)];
    out.push(`|{{Opponent|${escPos(O.tidy(t.teamName))}`);
    const people = roster?.length ? roster.slice().sort((a, b) => (b.role === 'captain') - (a.role === 'captain')) : t.nickCaptain ? [{ nick: t.nickCaptain, role: 'captain' }] : [];
    if (people.length) {
      out.push('  |players={{Persons');
      for (const u of people) out.push(`    |{{Person|${escPos(u.nick)}|flag=${u.role === 'captain' ? '|role=Captain' : ''}}}`);
      out.push('    }}');
    }
    out.push('}}');
  }
  out.push('}}');
  return out.join('\n');
}

/** 1v1: the players of the first shown bracket round, in bracket order (as the weekly pages list them). */
function participantsSolo(data, O, settings) {
  let names = [];
  if (data.bracket) {
    const S = bracketStructure(data);
    const r0 = startRound(S, settings, matchFilter(settings, S));
    for (const m of S.ub[r0] || []) {
      if (hasA(m)) names.push(O.nameOf(m.idTeamA, m.realNameA));
      if (hasB(m)) names.push(O.nameOf(m.idTeamB, m.realNameB));
    }
  }
  if (!names.length) names = teamsOf(data.detail).map((t) => t.nickCaptain || t.teamName);
  names = [...new Set(names.filter(Boolean))];
  if (!names.length) return null;
  return ['{{ParticipantTable|count=1|hidden=1', ...names.map((n, i) => `|p${i + 1}=${esc(n)}`), '}}'].join('\n');
}

/** Standings background like the older pages: 1 up, 2-3 stay up, 4-7 stay, 8+ down. */
export function defaultStandingsBg(n) {
  if (n < 4) return '1=up';
  return ['1=up', '2-3=stayup', ...(n > 7 ? ['4-7=stay', `8-${n}=down`] : [`4-${n}=stay`])].join(', ');
}

/**
 * Swiss / round-robin stage (TSS/Season_2026/The_Dino_Labs/4v4_RB):
 * {{GroupStandings}} with a {{Round}} per round linked to that round's
 * {{Matchlist}}, then the matchlists under ==={{HiddenSort|Round N}}===.
 */
function standingsBlock(data, O, list, label, settings, notes) {
  const out = [];
  const swiss = data.detail.typeTournament === 'swiss';
  const groups = [];
  for (const g of list) (g.GroupStage || []).forEach((standing, si) => groups.push({ standing, rounds: (g.GroupMatch || [])[si] || {} }));
  groups.forEach((g, gi) => {
    const letter = groups.length > 1 ? String.fromCharCode(65 + gi) : '';
    const times = Object.keys(g.rounds).sort((a, b) => Number(a) - Number(b)).filter((t) => (g.rounds[t] || []).length);
    const ids = times.map((t, ri) => {
      const id = `tss${data.id}${letter.toLowerCase()}r${ri + 1}`;
      return /^[A-Za-z0-9]{10}$/.test(id) ? id : wikiId(`tss-${data.id}`, `${letter}r${ri + 1}`);
    });
    out.push([
      '{{GroupStandings',
      `|title=${letter ? `${label} ${letter}` : 'Standings'}`,
      `|bg=${settings.standingsBg || defaultStandingsBg(g.standing.length)}`,
      `|tiebreakers={{Json|${swiss ? 'points|buchholz|gamediff' : 'points|ml.points|gamediff'}}}`,
      ...ids.map((id, ri) => `|round${ri + 1}={{Round|title=Round ${ri + 1}|matchgroups=${id}}}`),
      '}}',
    ].join('\n'));
    out.push('{{Box|break|padding=1em}}');
    times.forEach((t, ri) => {
      const rn = `${letter ? `${letter} ` : ''}Round ${ri + 1}`;
      const parts = [`==={{HiddenSort|${rn}}}===`, `{{Matchlist|id=${ids[ri]}|title=${rn}|collapsed=0`];
      g.rounds[t].forEach((m, k) => {
        const both = hasA(m) && hasB(m);
        const done = both && Boolean(m.winner);
        if (both && !m.winner && data.detail.tournamentStatus === 'past') notes.noWinner += 1;
        const own = m.timeInvite || m.timeStart || t;
        parts.push(`|M${k + 1}=${[
          '{{Match',
          `|date=${tssTime(own).replace(' {{abbr/UTC}}', '{{Abbr/UTC}}')}`,
          `|opponent1=${O.opp(m.idTeamA, m.realNameA, done ? m.scoreA : '')}`,
          `|opponent2=${O.opp(m.idTeamB, m.realNameB, done ? m.scoreB : '')}`,
          '}}',
        ].join('\n')}`);
      });
      parts.push('}}');
      out.push(parts.join('\n'));
      out.push(gi === groups.length - 1 && ri === times.length - 1 ? '{{Box|end}}' : '{{Box|break|padding=1em}}');
    });
  });
  return out.join('\n\n').replace(/\n\n(\{\{Box\|)/g, '\n$1');
}

export const tssUrl = (id) => `https://tss.warthunder.com/index.php?action=tournament&id=${id}`;

// --------------------------------------------------------------------- page

/**
 * The page: { text, warnings }. `settings` are normalized export settings
 * (lib/tss/settings.js); `data` comes from lib/tss/client.js (rosters and
 * match times optional).
 */
export function buildTssWikiPage(data, settings) {
  const d = data.detail;
  const O = opponents(data, settings);
  const S = settings.sections;
  const warnings = [];
  const notes = { noWinner: 0, filtered: 0, shape: false, startRound: 0 };
  const ctxBase = { bestof: d.amountBattles || '', past: d.tournamentStatus === 'past', mtimes: data.mtimes || {} };
  const out = [`<!-- Generated from ${tssUrl(data.id)} -->`, `{{DISPLAYTITLE:${esc(settings.title || d.nameEN || d.tournamentNameShort)}}}`];
  out.push(O.solo ? infoboxSolo(data, settings) : infoboxTeam(data, settings), '');
  if (S.format) out.push('==Format==', formatBlock(data, O.solo), '');
  if (S.description) {
    const lang = settings.lang === 'RU' ? 'RU' : 'EN';
    const txt = [bbToWiki(d[`descriptionTournament${lang}`]), bbToWiki(d[`structure_tournament_${lang}`])].filter(Boolean).join('\n\n');
    if (txt) out.push('===Rules===', txt, '');
  }
  if (S.prize) out.push('==Prize Pool==', O.solo ? prizeSolo(data) : prizeTeam(data, O, settings), '');
  if (S.maps && !O.solo) {
    const maps = mapPool(data);
    if (maps) out.push('==Map Pool==', maps, '');
  }
  if (S.participants) {
    const block = O.solo ? participantsSolo(data, O, settings) : participantsTeam(data, O, settings);
    if (block) out.push(...(O.solo ? [block] : ['==Participants==', block]), '');
    else warnings.push('TSS 上还没有参赛名单。');
  }
  if (S.results) {
    if (data.swiss?.length) out.push('==Result==', standingsBlock(data, O, data.swiss, 'Swiss Stage', settings, notes), '');
    if (data.groups?.length) out.push('==Group Stage==', standingsBlock(data, O, data.groups, 'Group', settings, notes), '');
    if (data.bracket) {
      const body = d.typeTournament === 'double-elumination' ? doubleBracket(data, O, settings, ctxBase, notes) : singleBracket(data, O, settings, ctxBase, notes);
      if (notes.shape) warnings.push('TSS 双败对阵的轮次和 Liquipedia 模板对不上，没有导出对阵图，请换一个起始轮再试。');
      else if (O.solo) out.push('==Results==', body, '');
      else out.push('==Playoffs==', '<section begin=Results />', `{{Toggle bracket start|sdate=${tssDay(d.dateStartTournament)}|dateexact=true}}`, body, '<section end=Results />', '{{Toggle bracket end}}', '');
    } else if (!data.swiss?.length && !data.groups?.length) {
      warnings.push('TSS 上还没有生成对阵，比赛开始后再导出一次。');
    }
  }
  if (S.trailer && !O.solo) out.push('==Gallery==', '<gallery mode="packed-hover" heights="250px">', '<!-- Add images to gallery by adding Image.png|Event -->', '</gallery>', '', '==References==', '{{Reflist}}');
  if (notes.startRound) warnings.push(`对阵图从胜者组第 ${notes.startRound + 1} 轮开始，之前的轮次没有导出。`);
  if (notes.filtered) warnings.push(`有 ${notes.filtered} 场比赛不在所选范围内，对阵图上的位置留空。`);
  if (notes.noWinner) warnings.push(`有 ${notes.noWinner} 场比赛 TSS 上没有胜者（已加注释），请核对。`);
  if (O.solo && data.bracket) warnings.push('选手名是 TSS 上现在的昵称，改过名的选手要手动改回比赛时的名字。');
  return { text: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, warnings };
}

// ------------------------------------------------------------ for the page

/** What the export page shows before generating: the event and its rounds. */
export function tssSummary(data) {
  const d = data.detail;
  const size = teamSizeOf(d);
  const S = data.bracket ? bracketStructure(data) : null;
  return {
    id: data.id,
    name: d.nameEN || d.tournamentNameShort || '',
    type: TYPES[d.typeTournament] || d.typeTournament || '',
    team_size: size,
    solo: size === 1,
    status: d.tournamentStatus || '',
    start: tssDay(d.dateStartTournament),
    end: tssDay(d.dateEndTournament),
    teams: teamsOf(d).length,
    has_bracket: Boolean(S?.ub.length),
    has_standings: Boolean(data.swiss?.length || data.groups?.length),
    upper_rounds: S ? S.ub.map((r, i) => ({ round: i + 1, teams: r.length * 2, left: S.ub.length - i })) : [],
    double: Boolean(S?.de),
  };
}

/** The bracket's matches with their numbers (#), for picking a range. */
export function matchIndex(data, settings) {
  if (!data.bracket) return [];
  const O = opponents(data, settings);
  return bracketStructure(data).all.map(({ m, seq, stage }) => ({
    seq,
    id: String(m.id),
    stage,
    a: hasA(m) ? O.nameOf(m.idTeamA, m.realNameA) : null,
    b: hasB(m) ? O.nameOf(m.idTeamB, m.realNameB) : null,
    score: hasA(m) && hasB(m) && (m.winner || Number(m.matchResult)) ? `${m.scoreA ?? ''}:${m.scoreB ?? ''}` : '',
    winner: winnerSide(m),
  }));
}
