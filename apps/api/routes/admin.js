import { requireAdmin, isAdminConfigured } from '../lib/admin.js';

export default async function adminRoutes(fastify) {
  // Used by the web client to validate a token before storing it.
  fastify.get('/admin/session', async (req) => {
    requireAdmin(fastify, req);
    return { admin: true, configured: true };
  });

  // Public, non-sensitive: lets the UI explain why admin login is unavailable.
  fastify.get('/admin/status', async () => ({
    configured: isAdminConfigured()
  }));
}
