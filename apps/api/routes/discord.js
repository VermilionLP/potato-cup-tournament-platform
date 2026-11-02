// Discord announcements (lib/discord.js): admins read and change the
// webhook settings and send a test message.

import { requireAdmin } from '../lib/admin.js';
import { discordMessage, discordSettingsProblem, loadDiscordSettings, maskWebhook, normalizeDiscordSettings, postWebhook, saveDiscordSettings } from '../lib/discord.js';

const view = (s) => ({ ...s, webhook_url: '', webhook_masked: maskWebhook(s.webhook_url), configured: Boolean(s.webhook_url) });

export default async function discordRoutes(fastify) {
  fastify.get('/admin/discord', async (req) => {
    requireAdmin(fastify, req);
    return view(await loadDiscordSettings(fastify.db));
  });

  // webhook_url: a new address, "" to remove it, or left out to keep it.
  fastify.put('/admin/discord', async (req) => {
    requireAdmin(fastify, req);
    const current = await loadDiscordSettings(fastify.db);
    const body = req.body || {};
    const next = normalizeDiscordSettings({
      webhook_url: body.webhook_url === undefined ? current.webhook_url : body.webhook_url,
      site_url: body.site_url === undefined ? current.site_url : body.site_url,
      events: { ...current.events, ...(body.events || {}) },
    });
    const problem = discordSettingsProblem(next);
    if (problem) throw fastify.httpErrors.badRequest(problem);
    return view(await saveDiscordSettings(fastify.db, next));
  });

  fastify.post('/admin/discord/test', async (req) => {
    requireAdmin(fastify, req);
    const settings = await loadDiscordSettings(fastify.db);
    if (!settings.webhook_url) throw fastify.httpErrors.badRequest('请先填写 Webhook 地址');
    const res = await postWebhook(settings.webhook_url, discordMessage('test'));
    if (!res.ok) {
      throw fastify.httpErrors.badRequest(`发送失败：${res.error}。服务器在中国大陆时通常无法直接连到 Discord，需要使用海外中转地址。`);
    }
    return { ok: true };
  });
}
