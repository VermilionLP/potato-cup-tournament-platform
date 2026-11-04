// Leaderboards open a player's details right under their row (stats and
// ladder pages). Rows carry data-row="<player id>"; the table and the phone
// list both render, one of them hidden.

/** Scrolls the visible row of player `id` near the top of the screen. */
export async function scrollToRow(id) {
  // After the open row has rendered (no svelte import: tested with node).
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const rows = [...document.querySelectorAll("[data-row]")].filter((el) => el.dataset.row === id && el.offsetParent !== null);
  rows[0]?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Long boards show this many rows at first, then more on request.
export const PAGE_SIZE = 30;

/**
 * The rows to show: the first `limit`, stretched to keep the open row
 * (`selectedId`) visible; everything while searching.
 */
export function visibleRows(rows, limit, { selectedId = "", searching = false } = {}) {
  if (searching) return rows;
  const open = selectedId ? rows.findIndex((r) => r.id === selectedId) : -1;
  return rows.slice(0, Math.max(limit, open + 1));
}
