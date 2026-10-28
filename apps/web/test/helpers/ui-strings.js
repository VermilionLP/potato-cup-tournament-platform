// Chinese UI text in the source, for the translation coverage test: text
// and tooltips in .svelte markup, and string literals in scripts (toasts,
// labels, confirm dialogs, API error messages). Runtime values ({...} in
// markup, ${...} in template strings) become "1". Comments are not text.
// `parse` is svelte/compiler's parse (passed in, so the helper loads
// anywhere).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HAN = /[一-鿿]/;
const ATTRS = new Set(['placeholder', 'title', 'aria-label']);
// Wiki markup and other text that is not shown as UI.
const NOT_UI = /\{\{|\[\[|^\s*\*|^<!--/;

export function sourceFiles(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}

function walkJs(node, add) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walkJs(n, add));
  if (node.type === 'Literal' && typeof node.value === 'string') add(node.value);
  else if (node.type === 'TemplateLiteral') add(node.quasis.map((q) => q.value.cooked).join('1'));
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    const v = node[key];
    if (v && typeof v === 'object') walkJs(v, add);
  }
}

// Markup: runs of text and {expressions} inside one parent form one text
// node on screen.
function walkMarkup(node, add, skip = false) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walkMarkup(n, add, skip));
  const nodes = node.nodes || node.fragment?.nodes;
  if (node.type === 'RegularElement' || node.type === 'Component' || node.type === 'SvelteElement') {
    skip = skip || ['textarea', 'code', 'pre', 'script', 'style'].includes(node.name)
      || (node.attributes || []).some((a) => a.name === 'data-no-i18n');
    for (const a of node.attributes || []) {
      if (a.type !== 'Attribute') continue;
      const parts = Array.isArray(a.value) ? a.value : [a.value];
      if (ATTRS.has(a.name) && !skip) add(parts.map((p) => (p?.type === 'Text' ? p.data : '1')).join(''));
      for (const p of parts) if (p?.type === 'ExpressionTag') walkJs(p.expression, add);
    }
  }
  if (nodes) {
    let run = '';
    const flush = () => {
      if (!skip && HAN.test(run)) add(run);
      run = '';
    };
    for (const child of nodes) {
      if (child.type === 'Text') run += child.data;
      else if (child.type === 'ExpressionTag') {
        run += '1';
        walkJs(child.expression, add);
      } else {
        flush();
        walkMarkup(child, add, skip);
      }
    }
    flush();
  }
  for (const key of ['consequent', 'alternate', 'body', 'fallback', 'pending', 'then', 'catch', 'fragment']) {
    if (node[key] && key !== 'fragment') walkMarkup(node[key], add, skip);
  }
  for (const key of ['expression', 'test', 'context', 'index', 'key']) {
    if (node[key] && typeof node[key] === 'object') walkJs(node[key], add);
  }
}

/** Map of Chinese UI string -> first file it was found in. */
export function uiStrings(parse, files) {
  const found = new Map();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const add = (s) => {
      // Whitespace (line breaks in dialogs too) is collapsed, as the translator does.
      const value = String(s).replace(/\s+/g, ' ').trim();
      if (HAN.test(value) && !NOT_UI.test(value) && !found.has(value)) found.set(value, file);
    };
    const ast = file.endsWith('.svelte') ? parse(text, { modern: true }) : parse(`<script>${text}</script>`, { modern: true });
    if (ast.instance) walkJs(ast.instance.content, add);
    if (ast.module) walkJs(ast.module.content, add);
    walkMarkup(ast.fragment, add);
  }
  return found;
}
