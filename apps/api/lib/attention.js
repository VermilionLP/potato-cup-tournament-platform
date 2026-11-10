// What needs a player now, for the site's in-page reminders (the page
// polls GET /reminders/:playerId while it is open). Pure: the route reads
// the rows, this picks the items, most urgent first. The page writes the
// words; each item carries a stable `key`, so a reminder that was seen or
// dismissed is not raised again.

import { banTurn } from '@potato-cup/shared/banpick.js';
import { checkinState, scheduledStart } from './checkin.js';
import { REPORT_CONFIRM_MS } from './match-reports.js';

export const SOON_MS = 60 * 60 * 1000;
const ORDER = { confirm: 0, ban: 1, ready: 2, checkin: 3, soon: 4 };

/**
 * events: [{ id, name, status, scheduled_time, checkin_enabled, checked_in_at, forfeited }]
 *   (the events the player is registered in);
 * matches: [{ id, tournament_id, player1_id, player2_id, status, pending_report, banpick }]
 *   (their pending matches); names: Map id -> display name.
 */
export function attentionItems(playerId, { events = [], matches = [], names = new Map() } = {}, now = Date.now()) {
  const items = [];
  const byId = new Map(events.map((e) => [e.id, e]));
  const nameOf = (id) => names.get(id) || id;

  for (const e of events) {
    const start = scheduledStart(e.scheduled_time);
    if (e.status === 'registration' && e.checkin_enabled && !e.checked_in_at && checkinState(e, now).open) {
      items.push({ key: `checkin:${e.id}`, kind: 'checkin', tournament_id: e.id, tournament: e.name, start: start == null ? null : new Date(start).toISOString() });
    } else if (e.status !== 'completed' && e.status !== 'in_progress' && start != null && now >= start - SOON_MS && now < start) {
      items.push({ key: `soon:${e.id}`, kind: 'soon', tournament_id: e.id, tournament: e.name, start: new Date(start).toISOString() });
    }
  }

  for (const m of matches) {
    const e = byId.get(m.tournament_id);
    if (!e || e.status !== 'in_progress' || m.status !== 'pending' || !m.player1_id || !m.player2_id) continue;
    if (e.forfeited) continue;
    const mine = m.player1_id === playerId ? 'A' : m.player2_id === playerId ? 'B' : null;
    if (!mine) continue;
    const opponentId = mine === 'A' ? m.player2_id : m.player1_id;
    const base = { tournament_id: e.id, tournament: e.name, match_id: m.id, opponent: nameOf(opponentId) };
    const r = m.pending_report;
    if (r) {
      if (r.kind === 'score' && !r.disputed && r.by === opponentId) {
        const at = Date.parse(r.at);
        items.push({
          ...base,
          key: `confirm:${m.id}:${r.at}`,
          kind: 'confirm',
          score: mine === 'A' ? [r.score1, r.score2] : [r.score2, r.score1],
          deadline: Number.isFinite(at) ? new Date(at + REPORT_CONFIRM_MS).toISOString() : null,
        });
      }
      // A report is in: the match is being settled, nothing to start.
      continue;
    }
    const state = m.banpick?.state;
    if (state?.phase === 'ban' && banTurn(state) === mine) {
      items.push({ ...base, key: `ban:${m.id}:${state.bans.length}`, kind: 'ban' });
    } else {
      items.push({ ...base, key: `ready:${m.id}:${m.player1_id}:${m.player2_id}`, kind: 'ready' });
    }
  }
  return items.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
