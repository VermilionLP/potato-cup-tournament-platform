// Sends uncaught errors and unhandled promise rejections in the browser to
// the API (POST /client-errors), so admins can see what visitors ran into
// (/errors). A few per page load at most, each message once, nothing from
// browser extensions or known harmless browser noise.

const MAX_PER_PAGE = 5;
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i, // cross-origin script without details
  /Failed to fetch dynamically imported module/i, // old tab after a deploy; the page reloads
  /NetworkError|Load failed|Failed to fetch/i, // offline / flaky network
  /AbortError/i,
];
const EXTENSION = /(chrome|moz|safari)-extension:\/\//;

/** What to send for an error event, or null to ignore it. */
export function errorReport(error, { message = "", page = "", userAgent = "" } = {}) {
  const text = String(error?.message || message || error || "").trim();
  const stack = String(error?.stack || "");
  if (!text || NOISE.some((re) => re.test(text)) || EXTENSION.test(stack)) return null;
  // The server said no (4xx: "not your turn", "already confirmed"…): the
  // page shows that to the visitor; it is not a bug in the page.
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) return null;
  return { message: text.slice(0, 500), stack: stack.slice(0, 4000), page, userAgent };
}

/** Starts reporting; returns a function that stops it. */
export function installErrorReporting(send) {
  const seen = new Set();
  let sent = 0;
  const report = (error, message) => {
    const r = errorReport(error, { message, page: location.pathname, userAgent: navigator.userAgent });
    if (!r || seen.has(r.message) || sent >= MAX_PER_PAGE) return;
    seen.add(r.message);
    sent += 1;
    Promise.resolve()
      .then(() => send(r))
      .catch(() => {}); // reporting must never cause more errors
  };
  const onError = (e) => report(e.error, e.message);
  const onRejection = (e) => report(e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
