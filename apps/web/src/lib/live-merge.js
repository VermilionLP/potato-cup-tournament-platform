// Pure part of #lib/live-sync.js (tested with node): which live messages a
// delta covers, and merging a delta into the event.

export const DELTA_TYPES = new Set([
  "score_updated",
  "match_result_submitted",
  "match_walkover_submitted",
  "match_result_auto_confirmed",
  "match_rolled_back",
  "match_created",
  "match_report_submitted",
  "match_report_disputed",
  "match_report_withdrawn",
  "active_match_updated",
  "overlay_state_updated",
  "match_live_score",
  "match_banpick",
  "game_state",
]);

/** The event with a delta merged in: changed matches replaced, removed ones dropped, order from the server. */
export function mergeLive(current, delta) {
  const { delta: _flag, match_ids: ids = [], changed_matches: changed = [], ...rest } = delta;
  const byId = new Map((current?.matches || []).map((m) => [m.id, m]));
  for (const m of changed) byId.set(m.id, m);
  const matches = ids.map((id) => byId.get(id)).filter(Boolean);
  // A match the event had never seen and that wasn't sent: reload fully.
  const complete = matches.length === ids.length;
  return { tournament: { ...current, ...rest, matches }, complete };
}
