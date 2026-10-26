// QQ group verification used by the web client when a player signs in.
// Extracted from the removed replay module because the login flow still needs it.

export default async function qqRoutes(fastify) {
  fastify.post('/verify-qq', async () => ({ valid: true }));
}
