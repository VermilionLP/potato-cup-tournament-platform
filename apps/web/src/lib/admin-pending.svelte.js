// Admins: matches waiting for an admin (a disputed score, a walkover
// claim) across running events, polled while a page of the site is open
// (GET /admin/pending). The header's shield shows the count and the list
// (AdminMenu); a new one also shows a toast with a link to the console.

import { toast } from "svelte-sonner";
import { API } from "./api.js";
import { pendingKey, pendingText } from "./admin-pending.js";

export { pendingKey, pendingText };

const POLL_MS = 45_000;


class AdminPending {
  items = $state([]);
  #seen = null; // keys already shown (null before the first poll)
  #timer = null;

  start() {
    if (typeof window === "undefined") return () => {};
    const onVisible = () => document.visibilityState === "visible" && this.poll();
    document.addEventListener("visibilitychange", onVisible);
    this.poll();
    this.#timer = setInterval(() => document.visibilityState === "visible" && this.poll(), POLL_MS);
    return () => {
      clearInterval(this.#timer);
      document.removeEventListener("visibilitychange", onVisible);
      this.items = [];
      this.#seen = null;
    };
  }

  async poll() {
    let items;
    try {
      ({ items } = await API.getAdminPending());
    } catch {
      return; // signed out or offline: keep what we had
    }
    const first = this.#seen === null;
    const seen = this.#seen || new Set();
    for (const i of items || []) {
      const key = pendingKey(i);
      if (!first && !seen.has(key)) {
        toast.warning(i.kind === "dispute" ? "比分有异议，需要管理员处理" : "弃权申报，需要管理员确认", {
          description: `${i.tournament} · ${pendingText(i)}`,
          duration: 15_000,
          action: { label: "去处理", onClick: () => (window.location.href = `/tournament/${encodeURIComponent(i.tournament_id)}/console`) },
        });
      }
      seen.add(key);
    }
    this.#seen = seen;
    this.items = items || [];
  }
}

export const adminPending = new AdminPending();
