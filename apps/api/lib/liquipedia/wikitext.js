// Minimal MediaWiki template parser for Liquipedia pages. It understands
// nested {{templates}}, [[links]] and <!-- comments --> well enough to read
// infoboxes, brackets, matchlists and group tables. No network access.

/** Removes HTML comments (an unterminated comment runs to the end). */
export function stripComments(text) {
  return String(text ?? '').replace(/<!--[\s\S]*?(?:-->|$)/g, '');
}

export function normalizeName(name) {
  const n = String(name ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return n ? n[0].toUpperCase() + n.slice(1) : n;
}

// Index of the "}}" closing the template that opens at `start` ("{{"), or -1.
function matchingClose(text, start) {
  let depth = 0;
  for (let i = start; i < text.length - 1; i += 1) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth += 1;
      i += 1;
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth -= 1;
      i += 1;
      if (depth === 0) return i - 1;
    }
  }
  return -1;
}

// Splits on "|" that are not inside nested {{ }} or [[ ]].
function splitTopLevel(body) {
  const parts = [];
  let depthT = 0;
  let depthL = 0;
  let current = '';
  for (let i = 0; i < body.length; i += 1) {
    const two = body.slice(i, i + 2);
    if (two === '{{') { depthT += 1; current += two; i += 1; continue; }
    if (two === '}}') { depthT -= 1; current += two; i += 1; continue; }
    if (two === '[[') { depthL += 1; current += two; i += 1; continue; }
    if (two === ']]') { depthL -= 1; current += two; i += 1; continue; }
    if (body[i] === '|' && depthT === 0 && depthL === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += body[i];
  }
  parts.push(current);
  return parts;
}

// Position of the first "=" outside nested templates/links, or -1.
function topLevelEquals(part) {
  let depthT = 0;
  let depthL = 0;
  for (let i = 0; i < part.length; i += 1) {
    const two = part.slice(i, i + 2);
    if (two === '{{') { depthT += 1; i += 1; continue; }
    if (two === '}}') { depthT -= 1; i += 1; continue; }
    if (two === '[[') { depthL += 1; i += 1; continue; }
    if (two === ']]') { depthL -= 1; i += 1; continue; }
    if (part[i] === '=' && depthT === 0 && depthL === 0) return i;
  }
  return -1;
}

/**
 * Top-level templates in `text`, in order: { name, params, start, end }.
 * `params` maps "1", "2", ... (positional) and named keys to trimmed values.
 */
export function parseTemplates(text) {
  const src = String(text ?? '');
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{{', i);
    if (open < 0) break;
    // Skip template parameters {{{...}}}.
    if (src[open + 2] === '{') {
      i = open + 3;
      continue;
    }
    const close = matchingClose(src, open);
    if (close < 0) break;
    const body = src.slice(open + 2, close);
    const [rawName, ...rest] = splitTopLevel(body);
    const params = {};
    let positional = 0;
    for (const part of rest) {
      const eq = topLevelEquals(part);
      if (eq >= 0) {
        params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
      } else {
        positional += 1;
        params[String(positional)] = part.trim();
      }
    }
    out.push({ name: normalizeName(rawName), params, start: open, end: close + 2 });
    i = close + 2;
  }
  return out;
}

/** First top-level template in `text` with one of `names`, or null. */
export function findTemplate(text, ...names) {
  const wanted = names.map(normalizeName);
  return parseTemplates(text).find((t) => wanted.includes(t.name)) || null;
}

/** Resolves the few magic words the Potato Cup pages use. */
export function resolveMagic(value, pageTitle = '') {
  const sub = String(pageTitle).split('/').pop();
  return String(value ?? '')
    .replace(/\{\{\s*SUBPAGENAME\s*\}\}/gi, sub)
    .replace(/\{\{\s*PAGENAME\s*\}\}/gi, String(pageTitle).split('/').pop())
    .replace(/\{\{\s*!\s*\}\}/g, '|')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
