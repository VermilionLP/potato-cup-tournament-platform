// The event page's tabs (remembered in the address as #overview / #guide / #bracket
// / #pool / #players / #live). A running event opens on its bracket, the
// others on the overview. The vehicle pool tab shows when the event has a
// template (for admins also without one, to pick it).

export const TAB_IDS = ["overview", "guide", "bracket", "pool", "players", "live"];

/** The tabs for an event: [{ id, label, count? }]. */
export function eventTabs(tournament, { hasTemplate = false, isAdmin = false, banpickEnabled = true } = {}) {
  return [
    { id: "overview", label: "概览" },
    // What players do and how the event runs (EventGuideTab).
    { id: "guide", label: "说明" },
    { id: "bracket", label: tournament?.status === "registration" ? "对阵预览" : "对阵" },
    ...(hasTemplate || (isAdmin && banpickEnabled) ? [{ id: "pool", label: "载具池" }] : []),
    { id: "players", label: "选手", count: tournament?.players?.length ?? 0 },
    { id: "live", label: "直播" },
  ];
}

/** The tab shown: the chosen one, else the default for the event's stage. */
export function activeTabOf(tournament, chosen = "") {
  return chosen || (tournament?.status === "in_progress" ? "bracket" : "overview");
}

/** A tab id from an address hash ("#live"), or "". */
export const tabFromHash = (hash = "") => (TAB_IDS.includes(hash.replace(/^#/, "")) ? hash.replace(/^#/, "") : "");
