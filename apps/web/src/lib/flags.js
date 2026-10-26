// Country flag helpers.
//
// Flags are shipped as SVGs in `static/flags/<iso>.svg` and rendered by
// `$lib/components/Flag.svelte`. They are deliberately not emoji: Windows
// ships no flag emoji font, so `🇨🇳` degrades to the letters "CN" there.

// Spellings that show up in player data but are not ISO 3166-1 codes.
const ALIASES = {
  uk: 'gb',
  en: 'gb',
  el: 'gr',
  zh: 'cn',
  ja: 'jp',
  ko: 'kr',
};

/**
 * Normalises a flag value to a lowercase two-letter country code.
 * Returns '' when the value cannot be mapped to a code.
 */
export function normalizeFlagCode(code) {
  const raw = String(code ?? '').trim().toLowerCase();
  if (!raw) return '';
  const alias = ALIASES[raw];
  if (alias) return alias;
  if (!/^[a-z]{2}$/.test(raw)) return '';
  return raw;
}

/** Public URL of the flag SVG, or '' when the code is unusable. */
export function flagSrc(code) {
  const normalized = normalizeFlagCode(code);
  return normalized ? `/flags/${normalized}.svg` : '';
}
