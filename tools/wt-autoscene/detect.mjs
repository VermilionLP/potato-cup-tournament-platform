// Game state from War Thunder's local web map API (http://localhost:8111):
// pure functions, tested in test.mjs.
//
//   offline  the client is not running (or the API is off)
//   hangar   no battle loaded (map_info.valid is false)
//   battle   a battle is loaded and its mission is still running
//   ended    a battle is loaded but its mission is over
//
// Recordings of full spectated battles (2026-10) show mission.status stays
// "running" and objectives null until the client leaves the battle (a
// second or two without answers, then the hangar), so the end of a battle
// is normally seen as battle -> hangar; see nextScene(). The "ended" check
// stays for modes that do report a result.

const OVER = new Set(['success', 'fail', 'failed', 'win', 'lose', 'loss', 'completed', 'finished']);

export function detectState({ reachable, mapInfo, mission }) {
  if (!reachable) return 'offline';
  if (!mapInfo || mapInfo.valid !== true) return 'hangar';
  const status = String(mission?.status ?? '').toLowerCase();
  if (OVER.has(status)) return 'ended';
  return 'battle';
}

/**
 * Scene to show after a state change, given the last state that was not
 * "offline" (the API stops answering for a few seconds while loading and
 * leaving a battle). Returns { scene, delayed } or null to keep the scene:
 * leaving a battle counts as its end, shown after the end delay so viewers
 * see the result first.
 */
export function nextScene(lastActive, to) {
  if (to === 'offline') return null;
  if (to === 'battle') return { scene: 'battle', delayed: false };
  if (to === 'ended') return { scene: 'ended', delayed: true };
  if (lastActive === 'battle') return { scene: 'ended', delayed: true };
  if (lastActive === 'ended') return null;
  return { scene: 'hangar', delayed: false };
}

/**
 * Debounce: a new state counts once it has been seen `stable` polls in a
 * row, so loading screens and one-off read errors do not flip scenes.
 */
export function stateTracker(stable = 2) {
  let current = null;
  let candidate = null;
  let seen = 0;
  return (state) => {
    if (state === current) {
      candidate = null;
      seen = 0;
      return null;
    }
    if (state !== candidate) {
      candidate = state;
      seen = 0;
    }
    seen += 1;
    if (seen < stable) return null;
    const from = current;
    current = state;
    candidate = null;
    seen = 0;
    return { from, to: state };
  };
}

/** obs-websocket v5 authentication string. */
export async function obsAuth(password, salt, challenge) {
  const { createHash } = await import('node:crypto');
  const secret = createHash('sha256').update(password + salt).digest('base64');
  return createHash('sha256').update(secret + challenge).digest('base64');
}
