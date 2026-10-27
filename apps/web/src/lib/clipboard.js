// Copy text to the clipboard. navigator.clipboard only exists on HTTPS (and
// localhost); the site is also served over plain HTTP, where a hidden
// textarea and document.execCommand("copy") still work. Resolves to true
// when the text was copied.
export async function copyText(text) {
  const value = String(text ?? "");
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to the old way
    }
  }
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, value.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
