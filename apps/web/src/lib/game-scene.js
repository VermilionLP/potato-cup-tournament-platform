// The game state the auto-scene script (tools/wt-autoscene) reports for a
// live channel, and what the overlay shows because of it. Pure; used by the
// overlay page, the console and 我要直播.
//
// The script reads War Thunder's local API on the streaming PC and tells the
// server hangar / battle / ended (left a battle) every 10 s. With it:
//   - a battle shows the in-game HUD, its end the bracket (for that match);
//   - the console picking a scene after the change takes over again;
//   - in Auto, after the Ban / Pick reveal the matchup card stays up until
//     the battle starts (without the script the HUD comes at once).
// Paused, or no check-in for GAME_STALE_MS: as if there were no script.

export const GAME_STALE_MS = 75_000;

/** Whether the script is there and in charge: { live, stale, paused }. */
export function gameStatus(game, now = Date.now()) {
  if (!game?.seen_at) return { live: false, stale: true, paused: Boolean(game?.paused), seen: false };
  const age = now - Date.parse(game.seen_at);
  const stale = !(age <= GAME_STALE_MS);
  return { live: !stale && !game.paused && Boolean(game.state), stale, paused: Boolean(game.paused), seen: true, age };
}

const time = (v) => {
  const t = Date.parse(v || "");
  return Number.isFinite(t) ? t : 0;
};

/**
 * The scene the game asks for, or null: the HUD in a battle; the bracket
 * after the live match's battle ended. Only when the change came after the
 * console last picked a scene.
 */
export function gameScene({ game, live, activeMatchId, overlaySetAt }) {
  if (!live || !game) return null;
  if (time(game.changed_at) < time(overlaySetAt)) return null;
  if (game.state === "battle") return "ingame";
  if (game.state === "ended" && (!activeMatchId || game.match_id == null || game.match_id === activeMatchId)) return "hybrid";
  return null;
}

/**
 * The overlay's scene. `param` is ?scene=, `chosen` the console's scene
 * ("auto" or one scene), `bp` whether the live match's Ban / Pick (or its
 * reveal) is on, `decided` whether the live match has its result.
 */
export function overlayScene({ param, countdownOver, chosen, game, live, activeMatchId, overlaySetAt, bp, decided }) {
  if (param && param !== "auto") return param;
  const fromGame = gameScene({ game, live, activeMatchId, overlaySetAt });
  if (fromGame) return fromGame;
  if (countdownOver) return "ingame";
  if (chosen && chosen !== "auto") return chosen;
  if (activeMatchId && bp) return "banpick";
  if (!activeMatchId) return "hybrid";
  if (!live) return "ingame";
  // The script is in charge: the HUD only in a battle.
  if (game.state === "battle") return "ingame";
  return decided ? "hybrid" : "versus";
}
