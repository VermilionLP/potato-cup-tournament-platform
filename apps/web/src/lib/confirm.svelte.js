// In-page replacements for window.confirm() / window.prompt(). The native
// dialogs can be blocked by the browser ("prevent this page from creating
// additional dialogs"), after which they return false / null without
// showing anything and the button seems dead; on phones they also look out
// of place. ConfirmHost.svelte (in the root layout) shows the request.
//
//   if (!(await askConfirm("确定删除？", { danger: true }))) return;
//   const text = await askText("轮数", "5");   // null when cancelled

export const confirmRequest = $state({
  open: false,
  message: "",
  confirmText: "确定",
  danger: false,
  input: false, // a text field (askText)
  value: "",
});

let resolver = null;
let hostMounted = false;

/** ConfirmHost registers itself; without it the native dialogs are used. */
export function setConfirmHost(mounted) {
  hostMounted = mounted;
}

function ask(message, { confirmText = "确定", danger = false, input = false, value = "" } = {}) {
  // A request still open is answered "no" before the new one replaces it.
  finishConfirm(input ? null : false);
  Object.assign(confirmRequest, { open: true, message: String(message ?? ""), confirmText, danger, input, value: String(value ?? "") });
  return new Promise((resolve) => (resolver = resolve));
}

/** Ends the open request with `answer` (ConfirmHost calls this). */
export function finishConfirm(answer) {
  const resolve = resolver;
  resolver = null;
  confirmRequest.open = false;
  resolve?.(answer);
}

/** Resolves true when confirmed, false when cancelled. */
export function askConfirm(message, options = {}) {
  if (!hostMounted) return Promise.resolve(typeof window !== "undefined" && window.confirm(message));
  return ask(message, options);
}

/** Resolves to the entered text, or null when cancelled. */
export function askText(message, value = "", options = {}) {
  if (!hostMounted) return Promise.resolve(typeof window !== "undefined" ? window.prompt(message, value) : null);
  return ask(message, { ...options, input: true, value });
}
