// Player contact details (QQ / Discord) live in `players.battle_tags`, a
// JSON string shaped as `{ "qq": "...", "discord": "..." }`.
//
// Rows written before the QQ/Discord change used `{ "cn": [], "global": [] }`
// (Battle.net tags); migration 008 moved those values into the new keys.
// Unknown keys are carried through untouched so saving a profile never
// drops data written by something else.

function firstString(value) {
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === 'string' && item.trim());
    return found ? found.trim() : '';
  }
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parses a raw `battle_tags` value into the editable contact fields plus the
 * untouched object so extra keys survive a save.
 */
export function parseContact(raw) {
  let parsed = {};
  if (raw) {
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {
      parsed = {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
  return {
    base: parsed,
    qq: firstString(parsed.qq),
    discord: firstString(parsed.discord),
  };
}

/** Rebuilds the `battle_tags` object from the edit fields. */
export function buildContact(base, { qq = '', discord = '' } = {}) {
  const out = { ...(base || {}) };
  delete out.cn;
  delete out.global;
  const put = (key, value) => {
    const text = String(value ?? '').trim();
    if (text) out[key] = text;
    else delete out[key];
  };
  put('qq', qq);
  put('discord', discord);
  return out;
}

/**
 * Splits the single "QQ / Discord" input used by the join dialog into the
 * contact fields. Digits are treated as a QQ number, everything else as a
 * Discord user name (a leading "@" is dropped).
 */
export function splitContactInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return { qq: '', discord: '' };
  if (text.startsWith('@')) {
    const discord = text.slice(1).trim();
    return { qq: '', discord };
  }
  if (/^\d{4,15}$/.test(text)) return { qq: text, discord: '' };
  return { qq: '', discord: text };
}

/** True when the player has neither a QQ number nor a Discord user name. */
export function contactIsEmpty(contact) {
  return !contact?.qq && !contact?.discord;
}
