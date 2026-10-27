// Site language (中文 / English). The UI is written in Chinese; in English
// mode a MutationObserver translates text, placeholders, tooltips and the
// page title as Svelte renders them, and confirm/alert/prompt messages go
// through the same dictionary. Switching back restores the original text.

import { translate } from './translate.js';

const STORAGE_KEY = 'potato-lang';
const HAN = /[一-鿿]/;
const ATTRS = ['placeholder', 'title', 'aria-label'];
const SKIP = 'script, style, textarea, code, pre, [data-no-i18n], [contenteditable="true"]';

export const i18n = $state({ locale: 'zh' });

// Original (Chinese) text per node and the value we last wrote, so a new
// value from Svelte is recognised as a new original.
const textOriginal = new WeakMap();
const textWritten = new WeakMap();
const attrOriginal = new WeakMap(); // element -> { attr: { orig, written } }

let observer = null;
let dialogsPatched = false;

function skipped(node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return !el || Boolean(el.closest(SKIP));
}

function handleText(node) {
  if (skipped(node)) return;
  const current = node.nodeValue;
  let orig = textOriginal.get(node);
  if (orig === undefined || current !== textWritten.get(node)) {
    orig = current;
    textOriginal.set(node, orig);
  }
  if (!HAN.test(orig)) return;
  const next = translate(orig);
  textWritten.set(node, next);
  if (next !== current) node.nodeValue = next;
}

function handleAttr(el, name) {
  if (!el.hasAttribute(name) || skipped(el)) return;
  const current = el.getAttribute(name);
  let store = attrOriginal.get(el);
  if (!store) attrOriginal.set(el, (store = {}));
  const entry = store[name];
  const orig = entry && current === entry.written ? entry.orig : current;
  if (!HAN.test(orig)) return;
  const next = translate(orig);
  store[name] = { orig, written: next };
  if (next !== current) el.setAttribute(name, next);
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) return handleText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  for (const name of ATTRS) handleAttr(root, name);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) handleText(node);
    else for (const name of ATTRS) handleAttr(node, name);
    node = walker.nextNode();
  }
}

function restore(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const orig = textOriginal.get(node);
      if (orig !== undefined && node.nodeValue === textWritten.get(node)) node.nodeValue = orig;
      textOriginal.delete(node);
      textWritten.delete(node);
    } else {
      const store = attrOriginal.get(node);
      if (store) {
        for (const [name, { orig, written }] of Object.entries(store)) {
          if (node.getAttribute(name) === written) node.setAttribute(name, orig);
        }
        attrOriginal.delete(node);
      }
    }
    node = walker.nextNode();
  }
}

function start() {
  if (observer) return;
  walk(document.documentElement);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') handleText(r.target);
      else if (r.type === 'attributes') handleAttr(r.target, r.attributeName);
      else for (const node of r.addedNodes) walk(node);
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

function stop() {
  observer?.disconnect();
  observer = null;
  restore(document.documentElement);
}

function patchDialogs() {
  if (dialogsPatched) return;
  dialogsPatched = true;
  for (const name of ['alert', 'confirm', 'prompt']) {
    const original = window[name].bind(window);
    window[name] = (message, ...rest) =>
      original(i18n.locale === 'en' ? translate(String(message ?? '')) : message, ...rest);
  }
}

export function setLocale(locale) {
  const next = locale === 'en' ? 'en' : 'zh';
  i18n.locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
  if (typeof document === 'undefined') return;
  document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
  if (next === 'en') start();
  else stop();
}

/** Saved choice, else the browser language (Chinese browsers get Chinese). */
export function initLocale() {
  if (typeof window === 'undefined') return;
  patchDialogs();
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  const preferred = saved || (/^zh\b/i.test(navigator.language || '') ? 'zh' : 'en');
  setLocale(preferred);
}

export function toggleLocale() {
  setLocale(i18n.locale === 'en' ? 'zh' : 'en');
}
