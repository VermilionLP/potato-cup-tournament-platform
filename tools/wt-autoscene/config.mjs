// Options of wt-autoscene: defaults, config.json keys and how they merge
// (command line > config.json > defaults). Secrets (adminToken,
// obsPassword) are read separately and never come from the command line.
// Also the panel's (panel.mjs) checks of what it saves to config.json.

import { isAbsolute, join } from 'node:path';

export const DEFAULTS = {
  channel: '1',
  game: 'http://127.0.0.1:8111',
  interval: '1000',
  stable: '2',
  'end-delay': '8',
  'min-battle': '60',
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
  minBattle: 'min-battle',
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

/**
 * The engine's config (engine.mjs) from merged options (mergeOptions) and
 * the secrets: numbers as numbers, camelCase names.
 */
export function toEngineConfig(opt, { token = '', obsPassword = '' } = {}) {
  const n = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v));
  return {
    site: String(opt.site || '').trim().replace(/\/+$/, ''),
    token: String(token || '').trim(),
    event: String(opt.event || '').trim(),
    channel: n(opt.channel, 1),
    game: String(opt.game || DEFAULTS.game).trim(),
    interval: n(opt.interval, 1000),
    stable: n(opt.stable, 2),
    endDelay: n(opt['end-delay'], 8),
    minBattle: n(opt['min-battle'], 60),
    obs: String(opt.obs || '').trim(),
    obsPassword: String(obsPassword || ''),
    obsBattle: String(opt['obs-battle'] || ''),
    obsEnded: String(opt['obs-ended'] || ''),
    obsHangar: String(opt['obs-hangar'] || ''),
    record: String(opt.record || ''),
    dryRun: Boolean(opt['dry-run']),
  };
}

// config.json keys the panel edits, and their types.
export const PANEL_KEYS = {
  site: 'string', adminToken: 'secret', event: 'string', channel: 'int',
  game: 'string', endDelay: 'number', minBattle: 'number', interval: 'int', stable: 'int',
  obs: 'string', obsPassword: 'secret', obsBattle: 'string', obsEnded: 'string', obsHangar: 'string',
  record: 'string', dryRun: 'bool', autoStart: 'bool',
};
export const DEFAULT_FILE = {
  site: '', adminToken: '', event: '', channel: 1, game: DEFAULTS.game, endDelay: 8, minBattle: 60,
  obs: '', obsPassword: '', obsBattle: '', obsEnded: '', obsHangar: '', record: '', dryRun: false, autoStart: false,
};

/** config.json with the panel's changes (unknown keys ignored); throws on a wrong type. */
export function applyChanges(current, changes = {}) {
  const next = { ...current };
  for (const [key, value] of Object.entries(changes || {})) {
    const type = PANEL_KEYS[key];
    if (!type) continue;
    if (type === 'bool') {
      next[key] = Boolean(value);
    } else if (type === 'int' || type === 'number') {
      const n = Number(value);
      if (value === '' || !Number.isFinite(n) || (type === 'int' && !Number.isInteger(n))) throw new Error(`${key} 必须是数字`);
      next[key] = n;
    } else {
      if (typeof value !== 'string') throw new Error(`${key} 必须是文字`);
      next[key] = value.trim();
      if (key === 'site') next[key] = next[key].replace(/\/+$/, '');
    }
  }
  return next;
}

/** The engine's config from config.json; a relative record path is in `dir`. */
export function panelEngineConfig(file, dir) {
  const cfg = toEngineConfig(mergeOptions({}, file), { token: file.adminToken, obsPassword: file.obsPassword });
  if (cfg.record && !isAbsolute(cfg.record)) cfg.record = join(dir, cfg.record);
  return cfg;
}
