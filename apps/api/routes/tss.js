// Liquipedia export of War Thunder TSS tournaments (tss.warthunder.com):
// the server reads the TSS event (lib/tss/client.js) and builds the wiki
// page (lib/tss/wiki.js) with the settings saved per TSS event
// (axsuck.tss_exports). Open to everyone: anyone can read an event and
// generate its page; only admins' settings are saved on the server (other
// people's stay in their browser), so the saved ones and the defaults new
// events start from are the admins'. Visitors are rate-limited
// (lib/rate-limit.js), as every page reads TSS. The site's own events have
// their export in routes/wiki.js.

import { getRequesterId, isAdminRequest } from '../lib/admin.js';
import { createTssClient, loadTournament, loadRosters, loadMatchTimes, TssError } from '../lib/tss/client.js';
import { buildTssWikiPage, exportedMatches, matchIndex, participantTeams, tssSummary } from '../lib/tss/wiki.js';
import { defaultTssSettings, normalizeTssSettings } from '../lib/tss/settings.js';
import { TssExportRepo } from '../repositories/tss-export-repo.js';

const TSS_ID = /^[1-9][0-9]{0,9}$/;

export default async function tssRoutes(fastify, opts = {}) {
  const repo = TssExportRepo(fastify.db);
  const client = opts.client || createTssClient();

  function idOf(req) {
    const id = String(req.params.id || '').trim();
    if (!TSS_ID.test(id)) throw fastify.httpErrors.badRequest('TSS 比赛 ID 是一串数字（比赛页面地址里 id= 后面的数字）');
    return id;
  }

  async function read(id) {
    try {
      return await loadTournament(client, id);
    } catch (err) {
      if (err instanceof TssError && err.code === 'TSS_NOT_FOUND') throw fastify.httpErrors.notFound(err.message);
      if (err instanceof TssError) {
        fastify.log?.warn({ err, tss: id }, 'TSS request failed');
        throw Object.assign(fastify.httpErrors.badGateway(err.message), { code: err.code });
      }
      throw err;
    }
  }

  // Saved settings, or the last saved ones of the same kind (1v1 / teams).
  async function settingsFor(id, solo) {
    const row = await repo.get(id);
    if (row) return { settings: normalizeTssSettings(row.settings), saved: true };
    return { settings: defaultTssSettings(await repo.latestOfKind(solo, id)), saved: false };
  }

  // Recently exported TSS events, for picking one again.
  fastify.get('/tss', async () => {
    return { data: await repo.recent(20) };
  });

  // The event as the export page shows it before generating: name, format,
  // rounds, every bracket match with its number, and the settings to use.
  fastify.get('/tss/:id', async (req) => {
    const id = idOf(req);
    const data = await read(id);
    const summary = tssSummary(data);
    const { settings, saved } = await settingsFor(id, summary.solo);
    return { data: { summary, matches: matchIndex(data, settings), settings, saved } };
  });

  // Returns the page made with the settings; an admin's settings are saved.
  fastify.put('/tss/:id/wiki', async (req) => {
    const id = idOf(req);
    const settings = normalizeTssSettings(req.body?.settings);
    const data = await read(id);
    const summary = tssSummary(data);
    let pageMatches;
    try {
      pageMatches = settings.sections.results && settings.exactTimes ? exportedMatches(data, settings) : [];
    } catch (err) {
      if (err.code === 'BAD_RANGE') throw fastify.httpErrors.badRequest(err.message);
      throw err;
    }
    const solo = settings.opponent === 'solo' || (settings.opponent === 'auto' && summary.solo);
    if (settings.sections.participants && settings.rosters && !solo) {
      await loadRosters(client, data, participantTeams(data, settings).map((t) => String(t.idTeam)));
    }
    if (pageMatches.length) await loadMatchTimes(client, data, pageMatches, settings.timeField);
    const { text, warnings } = buildTssWikiPage(data, settings);
    const saved = isAdminRequest(req);
    if (saved) await repo.save(id, { name: summary.name, solo: summary.solo, settings, updatedBy: getRequesterId(req) });
    return { data: { wikiScript: text, warnings, settings, saved } };
  });
}
