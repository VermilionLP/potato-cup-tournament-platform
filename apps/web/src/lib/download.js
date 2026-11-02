// Saves text as a file in the browser (JSON exports, pool CSV / JSON).

/** Downloads `text` as `filename`; a UTF-8 BOM is added for CSV (Excel). */
export function downloadText(filename, text, type = "application/json") {
  const body = type.startsWith("text/csv") ? "﻿" + text : text;
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
