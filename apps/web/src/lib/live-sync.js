// Live (SSE) updates of an event page, the console and the OBS overlay.
// A burst of messages becomes one refresh ($lib/coalesced-refresh.js).
// When every message in the burst is about matches or the live match
// (results, reports, overlay state) and an earlier read gave a
// `synced_at`, only the delta is fetched (GET /tournaments/:id/live: the
// changed matches, recomputed standings) and merged; anything else
// (registrations, settings, status) reloads the whole event.

import { API } from "./api.js";
import { coalescedRefresh } from "./coalesced-refresh.js";
import { DELTA_TYPES, mergeLive } from "./live-merge.js";

/**
 * Subscribes to an event's live updates. `current()` is the event as shown
 * (or null), `apply(next)` shows a new one. Returns stop().
 */
export function liveSync(id, { current, apply, delay, maxWait } = {}) {
  let fullNeeded = false;
  const refresh = coalescedRefresh(
    async () => {
      const now = current();
      const full = fullNeeded || !now?.synced_at;
      fullNeeded = false;
      if (!full) {
        try {
          const delta = await API.getTournamentLive(id, now.synced_at);
          const { tournament, complete } = mergeLive(current() || now, delta);
          if (complete) return apply(tournament);
        } catch (e) {
          console.warn("live delta failed, reloading the event", e);
        }
      }
      apply(await API.getTournament(id));
    },
    { ...(delay ? { delay } : {}), ...(maxWait ? { maxWait } : {}) },
  );
  let opened = false;
  const es = new EventSource(`/api/tournaments/${id}/stream`);
  es.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (e) {
      console.error("解析实时事件失败", e);
      return;
    }
    if (!DELTA_TYPES.has(message?.type)) fullNeeded = true;
    refresh();
  };
  // After a reconnect messages may have been missed: reload fully.
  es.onopen = () => {
    if (opened) {
      fullNeeded = true;
      refresh();
    }
    opened = true;
  };
  es.onerror = (e) => console.warn("实时推送连接发生错误，正在尝试重连...", e);
  return () => {
    es.close();
    refresh.stop();
  };
}
