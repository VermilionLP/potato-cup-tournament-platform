// Which other sites may call the API from a browser. The web app, the OBS
// overlay and the dev server (Vite proxy) are all same-origin, so by default
// no other origin is allowed. CORS_ORIGINS lists extra origins
// ("https://a.example,https://b.example"), or "*" for any (the old setting).

/** @fastify/cors `origin` option from CORS_ORIGINS. */
export function corsOrigin(value = process.env.CORS_ORIGINS) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (text === '*') return true;
  return text.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
}
