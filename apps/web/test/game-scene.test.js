import { test } from "node:test";
import assert from "node:assert/strict";
import { gameScene, gameStatus, overlayScene, GAME_STALE_MS } from "../src/lib/game-scene.js";

const now = Date.parse("2026-11-12T12:00:00Z");
const ago = (s) => new Date(now - s * 1000).toISOString();
const game = (state, extra = {}) => ({ state, match_id: 7, changed_at: ago(30), seen_at: ago(5), paused: false, ...extra });

test("the script counts while it checks in and isn't paused", () => {
  assert.equal(gameStatus(game("battle"), now).live, true);
  assert.equal(gameStatus(game("battle", { seen_at: ago(GAME_STALE_MS / 1000 + 1) }), now).live, false);
  assert.equal(gameStatus(game("battle", { paused: true }), now).live, false);
  assert.equal(gameStatus(game("battle", { paused: true }), now).paused, true);
  assert.equal(gameStatus(null, now).seen, false);
});

test("a battle shows the HUD, its end the bracket, unless the console picked a scene since", () => {
  assert.equal(gameScene({ game: game("battle"), live: true, activeMatchId: 7, overlaySetAt: ago(60) }), "ingame");
  assert.equal(gameScene({ game: game("battle"), live: true, activeMatchId: 7, overlaySetAt: ago(10) }), null);
  assert.equal(gameScene({ game: game("ended"), live: true, activeMatchId: 7 }), "hybrid");
  assert.equal(gameScene({ game: game("ended"), live: true, activeMatchId: 8 }), null, "another match went live");
  assert.equal(gameScene({ game: game("hangar"), live: true, activeMatchId: 7 }), null);
  assert.equal(gameScene({ game: game("battle"), live: false, activeMatchId: 7 }), null);
});

test("overlay scene: ?scene= first, then the game, the countdown, the console, Auto", () => {
  const base = { live: true, activeMatchId: 7, overlaySetAt: ago(60), chosen: "auto", bp: false, decided: false };
  assert.equal(overlayScene({ ...base, param: "intro", game: game("battle") }), "intro");
  assert.equal(overlayScene({ ...base, game: game("battle"), chosen: "versus" }), "ingame");
  assert.equal(overlayScene({ ...base, game: game("hangar"), chosen: "versus" }), "versus");
  assert.equal(overlayScene({ ...base, game: game("hangar"), countdownOver: true }), "ingame");
  // Auto with the script: Ban / Pick, then the matchup card until the battle.
  assert.equal(overlayScene({ ...base, game: game("hangar"), bp: true }), "banpick");
  assert.equal(overlayScene({ ...base, game: game("hangar") }), "versus");
  assert.equal(overlayScene({ ...base, game: game("hangar"), decided: true }), "hybrid");
  // A battle that started before the console picked Auto: still the HUD.
  assert.equal(overlayScene({ ...base, overlaySetAt: ago(5), game: game("battle") }), "ingame");
  // Without the script: as before (the HUD after Ban / Pick).
  assert.equal(overlayScene({ ...base, live: false, game: null }), "ingame");
  assert.equal(overlayScene({ ...base, live: false, game: null, activeMatchId: null }), "hybrid");
});
