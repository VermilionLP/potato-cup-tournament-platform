// Leaderboards open a player's details right under their row (stats and
// ladder pages). Rows carry data-row="<player id>"; the table and the phone
// list both render, one of them hidden.

import { tick } from "svelte";

/** Scrolls the visible row of player `id` near the top of the screen. */
export async function scrollToRow(id) {
  await tick();
  const rows = [...document.querySelectorAll("[data-row]")].filter((el) => el.dataset.row === id && el.offsetParent !== null);
  rows[0]?.scrollIntoView({ behavior: "smooth", block: "start" });
}
