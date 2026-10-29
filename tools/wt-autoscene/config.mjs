// Options of wt-autoscene: defaults, config.json keys and how they merge
// (command line > config.json > defaults). Secrets (adminToken,
// obsPassword) are read separately and never come from the command line.

export const DEFAULTS = {
  channel: '1',
  game: 'http://127.0.0.1:8111',
  interval: '1000',
  stable: '2',
  'end-delay': '8',
  'scene-battle': 'ingame',
  'scene-ended': 'intermission',
  'scene-hangar': 'hybrid',
  'dry-run': false,
  ask: false,
};

// config.json key -> option name.
export const CONFIG_KEYS = {
  site: 'site',
  event: 'event',
  channel: 'channel',
  game: 'game',
  interval: 'interval',
  stable: 'stable',
  endDelay: 'end-delay',
  sceneBattle: 'scene-battle',
  sceneEnded: 'scene-ended',
  sceneHangar: 'scene-hangar',
  obs: 'obs',
  obsBattle: 'obs-battle',
  obsEnded: 'obs-ended',
  obsHangar: 'obs-hangar',
  record: 'record',
  dryRun: 'dry-run',
  askEvent: 'ask',
};

export function mergeOptions(cli = {}, file = {}) {
  const opt = { ...DEFAULTS };
  for (const [key, name] of Object.entries(CONFIG_KEYS)) {
    const v = file[key];
    if (v === undefined || v === null || v === '') continue;
    opt[name] = typeof DEFAULTS[name] === 'boolean' ? Boolean(v) : String(v);
  }
  for (const [name, v] of Object.entries(cli)) {
    if (v !== undefined && name !== 'config' && name !== 'help') opt[name] = v;
  }
  return opt;
}
