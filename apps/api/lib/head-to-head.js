// Two players' history against each other (GET /players/:id/vs/:other, the
// QQ bot's 交手 card): matches won each way, games (maps) won each way, the
// last meetings (newest first) with the vehicle Ban / Pick settled on, and
// the vehicles they met in most. Finished events only. Pure: the route
// passes the awards context (routes/player-awards.js awardsData).

import { dateOf } from './hall-of-fame.js';

export const MEETINGS_SHOWN = 8;

const vehicleOf = (bp) => {
  const state = bp?.state;
  return state?.phase === 'done' ? state.vehicle || state.group || null : null;
};

/**
 * { a, b, series: { a, b }, games: { a, b }, walkovers, meetings: [{ event,
 * score_a, score_b, winner, walkover, vehicle }], vehicles: [{ name, times }] }.
 */
export function buildHeadToHead(a, b, ctx) {
  const who = (id) => ({ id, name: ctx.names.get(id)?.name || id, flag: ctx.names.get(id)?.flag || '' });
  const events = new Map(ctx.tournaments.map((t) => [t.id, t]));
  const vehicleByMatch = new Map((ctx.banpick || []).filter((r) => r.id != null).map((r) => [r.id, vehicleOf(r.banpick)]));
  const series = { a: 0, b: 0 };
  const games = { a: 0, b: 0 };
  let walkovers = 0;
  const meetings = [];
  for (const [tid, list] of ctx.matches) {
    const t = events.get(tid);
    if (!t) continue;
    for (const m of list) {
      const pair = (m.player1_id === a && m.player2_id === b) || (m.player1_id === b && m.player2_id === a);
      if (!pair || !m.winner_id) continue;
      const aFirst = m.player1_id === a;
      const walkover = m.status === 'walkover';
      const scoreA = walkover ? null : Number(aFirst ? m.score1 : m.score2) || 0;
      const scoreB = walkover ? null : Number(aFirst ? m.score2 : m.score1) || 0;
      if (m.winner_id === a) series.a += 1;
      else series.b += 1;
      if (walkover) walkovers += 1;
      else {
        games.a += scoreA;
        games.b += scoreB;
      }
      meetings.push({
        event: { id: t.id, name: t.name, date: dateOf(t) },
        order: [String(dateOf(t) || ''), Number(m.round) || 0, Number(m.id) || 0],
        score_a: scoreA,
        score_b: scoreB,
        winner: m.winner_id,
        walkover,
        vehicle: vehicleByMatch.get(m.id) || null,
      });
    }
  }
  meetings.sort((x, y) => y.order[0].localeCompare(x.order[0]) || y.order[2] - x.order[2]);
  const counts = new Map();
  for (const m of meetings) if (m.vehicle) counts.set(m.vehicle, (counts.get(m.vehicle) || 0) + 1);
  return {
    a: who(a),
    b: who(b),
    series,
    games,
    walkovers,
    meetings: meetings.slice(0, MEETINGS_SHOWN).map(({ order, ...m }) => m),
    total: meetings.length,
    vehicles: [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 3).map(([name, times]) => ({ name, times })),
  };
}
