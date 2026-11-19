// HTTP security headers on every response (pages, static files, /api),
// added here so they ship with the code rather than living only in the
// server's nginx config (nginx passes them through; hiding nginx's own
// version is `server_tokens off;` there).
//
// The Content-Security-Policy only covers what can't break the page:
// framing, <base>, plugins and form targets. Scripts, styles and images
// (inline SvelteKit bootstrap, vehicle pictures from other sites) are not
// restricted.

export const SECURITY_HEADERS = {
  // HTTPS only from now on (browsers ignore it over plain http).
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  // Only this site may put its pages in a frame (clickjacking).
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  // Features the site never uses.
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
};

export function registerSecurityHeaders(fastify, headers = SECURITY_HEADERS) {
  fastify.addHook('onSend', async (req, reply, payload) => {
    for (const [name, value] of Object.entries(headers)) if (!reply.hasHeader(name)) reply.header(name, value);
    // Nothing tells which server software answered.
    reply.removeHeader('x-powered-by');
    return payload;
  });
}
