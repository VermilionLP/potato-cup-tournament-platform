// Liquipedia page export (lib/liquipedia/export.js) and its per-event
// settings (tournaments.wiki_meta). Admins only: the page lists players and
// the settings are the organizer's.

import { TournamentRepo } from '../repositories/tournament-repo.js';
import { requireAdmin } from '../lib/admin.js';
import { groupStageOf } from '../lib/group-stage-view.js';
import { eventPlacements } from '../lib/placements.js';
import { resolveTemplate } from '../lib/vehicle-pools.js';
import { buildWikiPage } from '../lib/liquipedia/export.js';
import { defaultWikiMeta, normalizeWikiMeta } from '../lib/liquipedia/export-meta.js';

export default async function wikiRoutes(fastify) {
  const db = fastify.db;
  const repo = TournamentRepo(db);

  // Saved settings, or defaults carried over from the last event that has
  // some (same kind first: weekly / monthly).
  async function settingsFor(t) {
    if (t.wiki_meta) return { meta: normalizeWikiMeta(t.wiki_meta), saved: true };
    const prev = (await db.query(`
      SELECT wiki_meta, points_kind FROM axsuck.tournaments
      WHERE wiki_meta IS NOT NULL AND id <> $1
      ORDER BY (points_kind IS NOT DISTINCT FROM $2) DESC, created_at DESC
      LIMIT 1
    `, [t.id, t.points_kind])).rows[0];
    const previous = prev ? { ...prev.wiki_meta, __kind: prev.points_kind === 'monthly' ? 'monthly' : 'weekly' } : null;
    return { meta: defaultWikiMeta(t, previous), saved: false };
  }

  async function exportFor(req, t, meta) {
    const [players, matches, templates] = await Promise.all([
      repo.getPlayers(t.id),
      repo.getMatches(t.id),
      db.query('SELECT id, name, event_type, game_modes, sort_order FROM axsuck.vehicle_pools').then((r) => r.rows),
    ]);
    const effective = { ...meta };
    // The event's page on this site, when the request says where that is.
    if (!effective.bracketUrl && req.headers.referer) {
      try {
        effective.bracketUrl = `${new URL(req.headers.referer).origin}/tournament/${encodeURIComponent(t.id)}`;
      } catch {
        // no usable referer
      }
    }
    const groupStage = t.playoff_format ? groupStageOf(t, players, matches) : null;
    const placements = t.status === 'completed'
      ? eventPlacements(t, matches, players.map((p) => ({ id: p.id, seed: p.seed, swiss_group: p.swiss_group })))
      : new Map();
    const pool = t.banpick_enabled !== false ? resolveTemplate(templates, t) : null;
    const { text, warnings } = buildWikiPage({
      t,
      players,
      matches,
      groupStage,
      placements,
      meta: effective,
      vehiclePool: pool?.name || '',
    });
    return { wikiScript: text, warnings };
  }

  async function load(id) {
    const t = await repo.getById(id);
    if (!t) throw fastify.httpErrors.notFound('Tournament not found');
    return t;
  }

  fastify.get('/tournaments/:id/wiki', async (req) => {
    requireAdmin(fastify, req);
    const t = await load(req.params.id);
    const { meta, saved } = await settingsFor(t);
    return { ...(await exportFor(req, t, meta)), meta, saved };
  });

  // Saves the settings and returns the page made with them.
  fastify.put('/tournaments/:id/wiki', async (req) => {
    requireAdmin(fastify, req);
    const t = await load(req.params.id);
    const meta = normalizeWikiMeta(req.body?.meta);
    await db.query('UPDATE axsuck.tournaments SET wiki_meta = $1::jsonb WHERE id = $2', [JSON.stringify(meta), t.id]);
    return { ...(await exportFor(req, { ...t, wiki_meta: meta }, meta)), meta, saved: true };
  });
}
