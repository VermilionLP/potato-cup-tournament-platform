// Turns converted Liquipedia events into platform rows and writes them.
// Pure planning (planImport) is separate from the database writes
// (writeEvent) so the plan can be shown as a dry run first.

import { parseBracketTemplate } from './bracket-template.js';
import { convertPage, nameKey, similarNames } from './convert.js';
import { parseBlocks } from './page.js';
import { mergePlayerInto } from '../../repositories/player-repo.js';

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
 * Downloads every Potato Cup / Potato Cup Weekly page and the bracket
 * templates they use: { fetchedAt, source, license, pages, templates }.
 */
export async function downloadDump(client, log = () => {}) {
  const titles = (await client.listPages('Potato Cup')).filter((t) => /^Potato Cup( Weekly)?($|\/)/.test(t));
  log(`找到 ${titles.length} 个 Potato Cup 页面，正在下载内容（每 2 秒一次请求）...`);
  const pages = await client.wikiPages(titles);
  const names = templateNames(pages);
  log(`下载 ${names.length} 个对阵模板...`);
  const templates = await client.bracketTemplates(names);
  return { fetchedAt: new Date().toISOString(), source: SOURCE_BASE, license: 'CC-BY-SA 3.0', pages, templates };
}

/**
 * Converts every page and settles player ids.
 *
 * Names that only differ in letter case, spaces/underscores/dashes/dots or
 * look-alike Cyrillic letters ("steve_i400" / "Steve_i400", "NST" / "NST_",
 * "ComRad" / "ComRаd") are one player.
 *
 * `existingIds`: player ids already in the database. `platformIds`: those
 * of them that people use on the platform itself (entered a live event,
 * voted, logged in). The kept id is a platform id when the group has one,
 * otherwise the spelling the import uses most. Other existing ids of the
 * group (e.g. left over from an earlier import) are listed in
 * `playerMerges` so their data can be moved onto the kept id. Two platform
 * ids in one group are never merged automatically; they are listed in
 * `accountClashes` instead.
 *
 * `aliases`: { oldId: playerId } from manual merges and renames on the
 * platform. A Liquipedia name matching an alias goes to that player, so a
 * merge done by hand survives a re-import.
 */
export function planImport({ pages, templates, existingIds = [], platformIds = [], aliases = {}, today = new Date() }) {
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

  // Canonical ids per look-alike group.
  const counts = new Map();
  for (const e of events) {
    for (const r of e.matches) {
      for (const id of [r.player1_id, r.player2_id]) if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const platform = new Set(platformIds);
  const existingByKey = new Map();
  for (const id of existingIds) {
    const k = nameKey(id);
    if (!existingByKey.has(k)) existingByKey.set(k, []);
    existingByKey.get(k).push(id);
  }
  const variants = new Map();
  for (const name of counts.keys()) {
    const k = nameKey(name);
    if (!variants.has(k)) variants.set(k, []);
    variants.get(k).push(name);
  }
  const existingSet = new Set(existingIds);
  const aliasByKey = new Map();
  for (const [alias, playerId] of Object.entries(aliases)) {
    // A real player with exactly the alias name takes precedence.
    if (!existingSet.has(alias) && existingSet.has(playerId)) aliasByKey.set(nameKey(alias), playerId);
  }
  const canonical = new Map();
  const merged = [];
  const aliased = [];
  const playerMerges = [];
  const accountClashes = [];
  const byUse = (a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b);
  for (const [k, names] of variants) {
    const existing = existingByKey.get(k) || [];
    const onPlatform = existing.filter((id) => platform.has(id)).sort(byUse);
    const viaAlias = existing.length ? null : aliasByKey.get(k);
    const target = viaAlias || onPlatform[0] || [...names].sort(byUse)[0];
    if (viaAlias) aliased.push({ into: viaAlias, from: names });
    for (const n of names) canonical.set(n, target);
    const others = names.filter((n) => n !== target);
    if (others.length && !viaAlias) merged.push({ into: target, from: others });
    for (const id of existing) {
      if (id === target) continue;
      if (platform.has(id)) accountClashes.push({ kept: target, other: id });
      else playerMerges.push({ from: id, into: target });
    }
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
    aliased,
    playerMerges,
    accountClashes,
    similar: similarNames(playerIds),
    newPlayers: playerIds.filter((id) => !existing.has(id)).sort(),
    playerCount: playerIds.length,
    matchCount: events.reduce((n, e) => n + e.matches.filter((r) => r.player1_id && r.player2_id).length, 0),
  };
}

const clamp = (v, lo, hi) => (v == null ? null : Math.min(hi, Math.max(lo, Number(v))));

/** Only the leaderboard points (and tier) of an already imported event. */
export async function writeEventPoints(db, event) {
  const res = await db.query(
    `UPDATE axsuck.tournaments SET points_table = $1::jsonb, points_season = $2, points_kind = $3,
       points_invite = $5, tier = COALESCE($6, tier), event_kind = COALESCE($7, event_kind), updated_at = NOW()
     WHERE id = $4`,
    [
      event.pointsTable ? JSON.stringify(event.pointsTable) : null,
      event.pointsTable ? event.pointsSeason || null : null,
      event.pointsTable ? event.pointsKind || 'weekly' : null,
      event.id,
      Boolean(event.pointsTable && event.pointsKind === 'monthly'),
      event.tier || null,
      event.kind || null,
    ]
  );
  return res.rowCount > 0;
}

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

    // A player's last activity is at least the date of this event (not the
    // moment of the import).
    const date = event.date || null;
    const playedAt = date ? `${date}T00:00:00+08:00` : null;
    for (const p of event.players) {
      await client.query(
        `INSERT INTO axsuck.players (id, flag, last_seen_at) VALUES ($1, $2, $3::timestamptz)
         ON CONFLICT (id) DO UPDATE
         SET last_seen_at = GREATEST(axsuck.players.last_seen_at, EXCLUDED.last_seen_at)`,
        [p.id, p.flag || '', playedAt]
      );
    }

    await client.query(
      `INSERT INTO axsuck.tournaments
        (id, name, description, status, player_capacity, hold_third_place, loser_advances,
         scheduled_time, game_mode, vehicle_pool, format, grand_final_reset, swiss_rounds,
         banpick_enabled, playoff_format, swiss_group_size, advance_per_group, current_stage,
         played_at, source_url, source_title, points_table, points_season, points_kind, points_invite, tier, event_kind)
       VALUES ($1, $2, $3, 'completed', $4, $5, $19, $6, $7, $8, $9, $10, $11, FALSE, $12, $13, $14, $15,
         $16::timestamptz, $17, $18, $20::jsonb, $21, $22, $23, $24, $25)`,
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
        playedAt,
        event.sourceUrl || null,
        event.sourceTitle || null,
        event.loserAdvances ? 1 : 0,
        event.pointsTable ? JSON.stringify(event.pointsTable) : null,
        event.pointsTable ? event.pointsSeason || null : null,
        event.pointsTable ? event.pointsKind || 'weekly' : null,
        Boolean(event.pointsTable && event.pointsKind === 'monthly'),
        event.tier || null,
        event.kind || null,
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

/** Moves player `from` onto `into` (see mergePlayerInto) in one transaction. */
export async function mergePlayers(db, from, into) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await mergePlayerInto(client, from, into);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw new Error(`合并 ${from} -> ${into} 失败：${err.message}`);
  } finally {
    client.release();
  }
}
