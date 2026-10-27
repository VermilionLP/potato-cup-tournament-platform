// Chinese → English lookup for UI text. Exact entries match whole strings;
// entries with {0}, {1}, ... ({0:n}: a number only; {0:ord}: a number shown
// as an English ordinal) become patterns whose captured values (numbers,
// names, other labels) are translated in turn. Text with no match stays as
// it is, so player and event names are never changed.

import EN from './en.js';

const HAN = /[一-鿿]/;
const PLACEHOLDER = /\{(\d+)(?::(?:n|ord))?\}/g;
// English ordinal: 1st, 2nd, 3rd, 4th, 11th, 21st...
export function ordinal(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return String(value);
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const collapse = (s) => s.replace(/\s+/g, ' ').trim();

export function compile(dict) {
  const exact = new Map();
  const patterns = [];
  for (const [zh, en] of Object.entries(dict)) {
    const key = collapse(zh);
    if (!/\{\d+(?::(?:n|ord))?\}/.test(key)) {
      exact.set(key, en);
      continue;
    }
    const order = [];
    let source = '^';
    for (const part of key.split(/(\{\d+(?::(?:n|ord))?\})/)) {
      const m = /^\{(\d+)(:n|:ord)?\}$/.exec(part);
      if (m) {
        order.push(Number(m[1]));
        // A value never spans a label separator, so "A · B" is not swallowed
        // by a short pattern such as "{0}淘汰".
        // {0:n} / {0:ord} take a number only.
        source += m[2] ? '(\\d+)' : '([^·•|]+?)';
      } else if (part) {
        // Spacing around numbers varies between the source and the screen.
        source += escape(part).replace(/ /g, '\\s*');
      }
    }
    source += '$';
    patterns.push({
      re: new RegExp(source, 's'),
      order,
      en,
      // More fixed text = more specific: try those first; on a tie, fewer
      // placeholders ("{0} 天后" before "{0} 天 {1}").
      weight: key.replace(PLACEHOLDER, '').replace(/\s/g, '').length * 10 - order.length,
    });
  }
  patterns.sort((a, b) => b.weight - a.weight);
  return { exact, patterns };
}

export function createTranslator(dict = EN) {
  const { exact, patterns } = compile(dict);
  const cache = new Map();

  function core(text, depth) {
    if (exact.has(text)) return exact.get(text);
    for (const p of patterns) {
      const m = p.re.exec(text);
      if (!m) continue;
      const values = {};
      p.order.forEach((index, i) => {
        values[index] = depth < 3 ? translate(m[i + 1], depth + 1) : m[i + 1];
      });
      return p.en.replace(/\{(\d+)(:ord)?\}/g, (_, i, ord) => (ord ? ordinal(values[i]) : values[i] ?? ''));
    }
    // "Prefix: message" (toasts show "…失败: " + a server message) and
    // "Label:" on its own. A colon between digits (10:00) is not a label.
    const colon = /^(.*?(?:：|:(?!\d)))\s*(.*)$/s.exec(text);
    if (colon) {
      const label = colon[1].slice(0, -1);
      let head = colon[2] ? translate(colon[1], depth + 1) : colon[1];
      if (head === colon[1] && HAN.test(label)) {
        const bare = translate(label, depth + 1);
        if (bare !== label) head = `${bare}:`;
      }
      const tail = colon[2] ? translate(colon[2], depth + 1) : '';
      if (head !== colon[1] || tail !== colon[2]) return tail ? `${head} ${tail}` : head;
    }
    // Labels joined with separators ("A · B", "• A"), then single words
    // ("RB 历史模式"): translate the parts that are known.
    for (const splitter of [/(\s*[·•|→]\s*)/, /(\s+)/]) {
      const parts = text.split(splitter);
      if (parts.length < 2) continue;
      const out = parts.map((part, i) => (i % 2 ? part : translate(part, depth + 1))).join('');
      if (out !== text) return out;
    }
    return null;
  }

  function translate(text, depth = 0) {
    const value = String(text ?? '');
    if (!HAN.test(value)) return value;
    const lead = value.match(/^\s*/)[0];
    const trail = value.match(/\s*$/)[0];
    const key = collapse(value);
    if (!cache.has(key)) {
      cache.set(key, null); // a fallback that comes back to the same text stops here
      cache.set(key, core(key, depth));
    }
    const hit = cache.get(key);
    return hit == null ? value : lead + hit + trail;
  }

  return translate;
}

export const translate = createTranslator();
