// Turns converted Liquipedia events into platform rows and writes them.
// Pure planning (planImport) is separate from the database writes
// (writeEvent) so the plan can be shown as a dry run first.

import { parseBracketTemplate } from './bracket-template.js';
import { convertPage, similarNames } from './convert.js';
import { parseBlocks } from './page.js';

export const SOURCE_BASE = 'https://liquipedia.net/warthunder/';

export function sourceUrl(title) {
  return SOURCE_BASE + encodeURI(String(title).replace(/ /g, '_'));
}

/** Bracket template names ("Bracket/8U4L2DSL1D") used by the given pages. */
export function templateNames(pages) {
  const names = new Set();
  for (const [title, wikitext] of Object.entries(pages)) {
    for (const b of parseBlocks(wikitext || '', title)) {
      if (b.kind === 'bracket' && b.template) names.add(b.template);
    }
  }
  return [...names].sort();
}

/**
 * Converts every page and settles player ids.
 *
 * `existingIds`: ids already on the platform. A Liquipedia name that differs
 * from one of them (or from another imported name) only by letter case is
 * mapped onto it, so "steve_i400" and "Steve_i400" become one player. Other
 * look-alikes (extra underscores, Cyrillic letters) are only reported.
 */
export function planImport({ pages, templates, existingIds = [], today = new Date() }) {
  const parsedTemplates = new Map(
    Object.entries(templates).map(([name, text]) => [name, parseBracketTemplate(text)])
  );
  const skipped = [];
  const warnings = [];
  const events = [];
  for (const title of Object.keys(pages).sort()) {
    const out = convertPage({ title, wikitext: pages[title], templates: parsedTemplates, today });
    if (out.skipped) skipped.push({ title, reason: out.skipped });
    for (const w of out.warnings) warnings.push({ title, message: w });
    events.push(...out.events);
  }
  events.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.id.localeCompare(b.id));

  // Case-insensitive canonical ids: an existing platform id wins, otherwise
  // the spelling used most often in the import.
  const counts = new Map();
  for (const e of events) {
    for (const r of e.matches) {
      for (const id of [r.player1_id, r.player2_id]) if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const existingByLower = new Map(existingIds.map((id) => [id.toLowerCase(), id]));
  const variants = new Map();
  for (const name of counts.keys()) {
    const k = name.toLowerCase();
    if (!variants.has(k)) variants.set(k, []);
    variants.get(k).push(name);
  }
  const canonical = new Map();
  const merged = [];
  for (const [k, names] of variants) {
    const target = existingByLower.get(k)
      || [...names].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b))[0];
    for (const n of names) canonical.set(n, target);
    const others = names.filter((n) => n !== target);
    if (others.length) merged.push({ into: target, from: others });
  }
  const mapId = (id) => (id ? canonical.get(id) || id : id);

  for (const e of events) {
    e.sourceUrl = sourceUrl(e.sourceTitle);
    e.matches = e.matches.map((r) => ({
      ...r,
      player1_id: mapId(r.player1_id),
      player2_id: mapId(r.player2_id),
      winner_id: mapId(r.winner_id),
    }));
    const seen = new Set();
    e.players = e.players
      .map((p) => ({ ...p, id: mapId(p.id) }))
      .filter((p) => (seen.has(p.id) ? false : seen.add(p.id)))
      .map((p, i) => ({ ...p, seed: i + 1 }));
  }

  const playerIds = [...new Set(events.flatMap((e) => e.players.map((p) => p.id)))];
  const existing = new Set(existingIds);
  return {
    events,
    skipped,
    warnings,
    merged,
    similar: similarNames(playerIds),
    newPlayers: playerIds.filter((id) => !existing.has(id)).sort(),
    playerCount: playerIds.length,
    matchCount: events.reduce((n, e) => n + e.matches.filter((r) => r.player1_id && r.player2_id).length, 0),
  };
}

const clamp = (v, lo, hi) => (v == null ? null : Math.min(hi, Math.max(lo, Number(v))));

/**
 * Replaces one imported event (same id) inside a transaction: players are
 * created when missing, then the tournament, its entrants and its matches
 * with their winner/loser links.
 */
export async function writeEvent(db, event) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM axsuck.tournaments WHERE id = $1', [event.id]);

    for (const p of event.players) {
      await client.query(
        `INSERT INTO axsuck.players (id, flag) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.flag || '']
      );
    }

    const date = event.date || null;
    await client.query(
      `INSERT INTO axsuck.tournaments
        (id, name, description, status, player_capacity, hold_third_place, loser_advances,
         scheduled_time, game_mode, vehicle_pool, format, grand_final_reset, swiss_rounds,
         banpick_enabled, playoff_format, swiss_group_size, advance_per_group, current_stage,
         played_at, source_url, source_title)
       VALUES ($1, $2, $3, 'completed', $4, $5, 0, $6, $7, $8, $9, $10, $11, FALSE, $12, $13, $14, $15,
         $16::timestamptz, $17, $18)`,
      [
        event.id,
        event.name,
        '从 Liquipedia 导入的历史赛事',
        Math.max(2, event.players.length),
        event.holdThirdPlace ? 1 : 0,
        date || '',
        event.mode || 'rb',
        event.vehiclePool || 'proleague',
        event.format,
        Boolean(event.grandFinalReset),
        event.format === 'swiss' ? clamp(event.swissRounds, 1, 15) : null,
        event.playoffFormat || null,
        event.playoffFormat ? clamp(event.swissGroupSize, 2, 64) : null,
        event.playoffFormat ? clamp(event.advancePerGroup, 1, 64) : null,
        event.playoffFormat ? 'playoff' : 'group',
        date ? `${date}T00:00:00+08:00` : null,
        event.sourceUrl || null,
        event.sourceTitle || null,
      ]
    );

    for (const p of event.players) {
      await client.query(
        `INSERT INTO axsuck.tournament_players (tournament_id, player_id, seed, flag, swiss_group)
         SELECT $1, $2, $3, COALESCE(NULLIF($4, ''), p.flag, ''), $5
         FROM axsuck.players p WHERE p.id = $2`,
        [event.id, p.id, p.seed, p.flag || '', p.swiss_group ?? null]
      );
    }

    const idByKey = new Map();
    for (const r of event.matches) {
      const res = await client.query(
        `INSERT INTO axsuck.matches
          (tournament_id, bracket, round, position, player1_id, player2_id, score1, score2,
           winner_id, status, swiss_group, slot1_void, slot2_void)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          event.id,
          r.bracket,
          r.round,
          r.position,
          r.player1_id || null,
          r.player2_id || null,
          r.score1 || 0,
          r.score2 || 0,
          r.winner_id || null,
          r.status,
          r.swiss_group ?? null,
          Boolean(r.slot1_void),
          Boolean(r.slot2_void),
        ]
      );
      if (r.key) idByKey.set(r.key, res.rows[0].id);
    }
    for (const r of event.matches) {
      if (!r.key || (!r.next_key && !r.loser_next_key)) continue;
      await client.query(
        `UPDATE axsuck.matches
         SET next_match_id = $1, next_slot = $2, loser_next_match_id = $3, loser_next_slot = $4
         WHERE id = $5`,
        [
          idByKey.get(r.next_key) ?? null,
          r.next_key ? r.next_slot : null,
          idByKey.get(r.loser_next_key) ?? null,
          r.loser_next_key ? r.loser_next_slot : null,
          idByKey.get(r.key),
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw new Error(`${event.id}: ${err.message}`);
  } finally {
    client.release();
  }
}
