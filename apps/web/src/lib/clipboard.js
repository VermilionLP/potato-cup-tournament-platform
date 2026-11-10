// Copy text to the clipboard. Resolves to true when the text was copied.
//
// 1. navigator.clipboard (HTTPS and localhost only): writeText, then
//    write([ClipboardItem]), which some Safari versions accept when
//    writeText is refused.
// 2. A hidden textarea and document.execCommand("copy") (plain HTTP, and
//    browsers that refuse 1). The textarea goes next to `near` (the button
//    that was clicked) or into the open dialog / popover: those keep focus
//    to themselves, so one outside them cannot be selected. Safari does not
//    focus a button when it is clicked, so document.activeElement cannot be
//    trusted to find the popover: callers pass the button. iOS Safari needs
//    a 12pt font (smaller zooms the page), the box at the current scroll
//    position and a real selection range.
// Call it straight from the click handler, before any await: browsers only
// allow copying during the click.
export async function copyText(text, { near = null } = {}) {
  const value = String(text ?? "");
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof window !== "undefined" && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // try the next way
    }
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([value], { type: "text/plain" }) })]);
        return true;
      }
    } catch {
      // fall through to the old way
    }
  }
  return execCopy(value, near);
}

const TRAPS = '[role="dialog"], [data-slot="popover-content"], [data-popover-content], [data-dialog-content]';

function hostFor(near) {
  if (typeof document === "undefined") return null;
  return (
    near?.closest?.(TRAPS) ||
    near?.parentElement ||
    document.activeElement?.closest?.(TRAPS) ||
    document.querySelector('[role="dialog"][data-state="open"], [data-slot="popover-content"][data-state="open"]') ||
    document.body
  );
}

function execCopy(value, near) {
  const host = hostFor(near);
  if (!host) return false;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.tabIndex = -1;
  Object.assign(area.style, {
    position: "absolute",
    left: "-9999px",
    // In the page itself: where the person is looking (iOS scrolls to a focused box).
    top: host === document.body ? `${window.pageYOffset || document.documentElement.scrollTop || 0}px` : "0",
    fontSize: "12pt",
    border: "0",
    padding: "0",
    margin: "0",
    width: "1px",
    height: "1px",
  });
  const previous = document.activeElement;
  host.appendChild(area);
  let ok = false;
  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, value.length);
    // iOS Safari: select() alone may leave nothing selected.
    if (area.selectionEnd - area.selectionStart !== value.length) {
      const range = document.createRange();
      range.selectNodeContents(area);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      area.setSelectionRange(0, value.length);
    }
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  window.getSelection?.()?.removeAllRanges();
  if (previous && typeof previous.focus === "function") previous.focus({ preventScroll: true });
  return ok;
}

/** Selects an element's text on the page, so the person can copy it by hand when copyText fails. */
export function selectText(el) {
  if (!el || typeof window === "undefined") return false;
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  } catch {
    return false;
  }
}
