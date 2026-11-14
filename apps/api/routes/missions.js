// 比赛地图: War Thunder mission files for custom battles ("Missions by URL":
// the host pastes a direct link to a mission .blk and the game client
// downloads it, user agent "dagor2"; the game takes http:// links only).
//
//   GET /missions                      the maps (hidden ones for admins only)
//   GET /missions/<id>                 one map with its settings and versions
//   GET /missions/<id>.blk[?v=N]       the file as text (this is the link)
//   POST /missions                     admin: add (text, or a link to import)
//   PATCH /missions/:id                admin: name, description, credit, …
//   PUT /missions/:id/content          admin: new text, or settings / vehicle
//                                      edits (@potato-cup/shared/mission-blk.js);
//                                      vehicle_limit false removes the vehicle
//                                      limit, true puts the newest older
//                                      version's back (or a new one from units)
//   POST /missions/:id/revert          admin: a new version with an old text
//   DELETE /missions/:id               admin
//   PUT /tournaments/:id/missions      admin: the maps an event uses
//
// Every saved text is a new version (mission_versions, migration 055); edits
// carry the version they started from and a stale one is refused. A .blk
// not in the database is still served from MISSIONS_DIR (default
// ~/potato-missions, outside the deployed code). Downloads are logged with
// the address and user agent.

import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applyMissionEdits, MAX_MISSION_BYTES, missionProblems, missionSummary, vehicleLimitBlock } from '@potato-cup/shared/mission-blk.js';
import { isAdminRequest, requireAdmin } from '../lib/admin.js';

export const MISSION_FILE = /^[a-z0-9][a-z0-9_-]{0,79}\.blk$/i;
export const MISSION_ID = /^[a-z0-9][a-z0-9-]{1,59}$/;
export const MAX_EVENT_MISSIONS = 10;

export const missionsDir = () => process.env.MISSIONS_DIR || join(homedir(), 'potato-missions');

/** A link-friendly id from a name: "1v1 Joust (Desert)" → "1v1-joust-desert". */
export function missionSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

const COLUMNS = 'id, name, description, credit, source_url, hidden, sort_order, version, content, created_at, updated_at';
const META = { name: 120, description: 1000, credit: 120, source_url: 500 };

/** A row for the page: the text replaced by what it says (missionSummary) and its size. */
function shape(row) {
  if (!row) return row;
  const { content, ...rest } = row;
  return { ...rest, size: Buffer.byteLength(content || ''), summary: missionSummary(content || '') };
}

const editor = (req) => String(req.headers['x-player-id'] || '').trim().slice(0, 64) || null;

// Only public addresses (an admin's link, fetched by the server).
function sourceProblem(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '链接不对';
  }
  if (!/^https?:$/.test(u.protocol)) return '链接要以 http:// 或 https:// 开头';
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i.test(u.hostname) || !u.hostname.includes('.')) return '不能从这个地址导入';
  return null;
}

async function fetchMission(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow', headers: { 'user-agent': 'PotatoCup-missions' } });
  if (!res.ok) throw new Error(`对方返回 ${res.status}`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_MISSION_BYTES) throw new Error('地图文件太大（最大 2 MB）');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_MISSION_BYTES) throw new Error('地图文件太大（最大 2 MB）');
  return buf.toString('utf8');
}

export default async function missionsRoutes(fastify) {
  const db = fastify.db;

  const findMission = async (id) => (await db.query(`SELECT ${COLUMNS} FROM axsuck.missions WHERE id = $1`, [id])).rows[0] || null;

  // The vehicle limit block of the newest version that had one (to turn the
  // limit back on as it was), or null.
  async function previousLimitBlock(id) {
    const rows = (await db.query('SELECT content FROM axsuck.mission_versions WHERE mission_id = $1 ORDER BY version DESC LIMIT 30', [id])).rows;
    for (const r of rows) {
      const block = vehicleLimitBlock(r.content);
      if (block) return block;
    }
    return null;
  }

  async function serveFile(req, reply) {
    const { file } = req.params;
    if (!MISSION_FILE.test(file)) throw fastify.httpErrors.notFound('没有这个地图文件');
    const id = file.replace(/\.blk$/i, '').toLowerCase();
    let body = null;
    let modified = null;
    const row = db ? await findMission(id) : null;
    if (row && (!row.hidden || isAdminRequest(req))) {
      const v = Number(req.query?.v);
      if (Number.isInteger(v) && v > 0 && v !== row.version) {
        const old = (await db.query('SELECT content, created_at FROM axsuck.mission_versions WHERE mission_id = $1 AND version = $2', [id, v])).rows[0];
        if (!old) throw fastify.httpErrors.notFound('没有这个地图文件');
        body = old.content;
        modified = old.created_at;
      } else {
        body = row.content;
        modified = row.updated_at;
      }
    } else {
      // Not in the database: a file in MISSIONS_DIR.
      const path = join(missionsDir(), file);
      const info = await stat(path).catch(() => null);
      if (!info?.isFile() || info.size > MAX_MISSION_BYTES) throw fastify.httpErrors.notFound('没有这个地图文件');
      body = await readFile(path);
      modified = info.mtime;
    }
    req.log.info({ mission: file, ip: req.ip, forwardedFor: req.headers['x-forwarded-for'], ua: req.headers['user-agent'] || '', method: req.method }, 'mission file requested');
    reply
      .header('content-type', 'text/plain; charset=utf-8')
      .header('content-disposition', `inline; filename="${file}"`)
      .header('cache-control', 'no-cache')
      .header('access-control-allow-origin', '*');
    if (modified) reply.header('last-modified', new Date(modified).toUTCString());
    return reply.send(body);
  }

  fastify.get('/missions', async (req) => {
    const admin = isAdminRequest(req);
    const rows = (await db.query(`SELECT ${COLUMNS} FROM axsuck.missions ${admin ? '' : 'WHERE NOT hidden'} ORDER BY sort_order, name`)).rows;
    return { missions: rows.map(shape) };
  });

  // Fastify answers HEAD from this too.
  fastify.get('/missions/:file', async (req, reply) => {
    if (/\.blk$/i.test(req.params.file)) return serveFile(req, reply);
    const row = await findMission(req.params.file);
    if (!row || (row.hidden && !isAdminRequest(req))) throw fastify.httpErrors.notFound('没有这个地图');
    const versions = (await db.query(`
      SELECT version, note, created_by, created_at, octet_length(content) AS size
      FROM axsuck.mission_versions WHERE mission_id = $1 ORDER BY version DESC LIMIT 50
    `, [row.id])).rows;
    const events = (await db.query(`
      SELECT id, name, status, scheduled_time FROM axsuck.tournaments
      WHERE $1 = ANY(missions) ORDER BY scheduled_time DESC NULLS LAST LIMIT 20
    `, [row.id])).rows;
    // Admins turning a limit back on see the list it had.
    let previous = null;
    if (isAdminRequest(req) && !missionSummary(row.content)?.vehicleLimit) {
      const block = await previousLimitBlock(row.id);
      if (block) previous = { units: missionSummary(`mission_settings{\nmission{\n${block}}\n}\n`)?.units || null };
    }
    return { mission: shape(row), versions, events, previous_limit: previous };
  });

  async function saveVersion(id, content, note, by) {
    const row = (await db.query(`
      UPDATE axsuck.missions SET content = $2, version = version + 1, updated_at = NOW()
      WHERE id = $1 RETURNING ${COLUMNS}
    `, [id, content])).rows[0];
    await db.query(
      'INSERT INTO axsuck.mission_versions (mission_id, version, content, note, created_by) VALUES ($1, $2, $3, $4, $5)',
      [id, row.version, content, String(note || '').slice(0, 200), by],
    );
    return row;
  }

  fastify.post('/missions', async (req) => {
    requireAdmin(fastify, req);
    const body = req.body || {};
    let content = typeof body.content === 'string' ? body.content : '';
    const source = String(body.source_url || '').trim();
    const imported = !content && Boolean(source);
    if (imported) {
      const problem = sourceProblem(source);
      if (problem) throw fastify.httpErrors.badRequest(problem);
      try {
        content = await fetchMission(source);
      } catch (e) {
        throw fastify.httpErrors.badRequest(`没能从链接导入：${e.message}`);
      }
    }
    if (!content) throw fastify.httpErrors.badRequest('请上传地图文件或填写地图链接');
    const problems = missionProblems(content);
    if (problems.length) throw fastify.httpErrors.badRequest(`地图文件读不出来：${problems[0]}`);
    const summary = missionSummary(content);
    const name = String(body.name || summary.fields.locName || summary.name || '').trim().slice(0, META.name);
    if (!name) throw fastify.httpErrors.badRequest('请填写地图名称');
    const id = String(body.id || missionSlug(name) || '').trim().toLowerCase();
    if (!MISSION_ID.test(id)) throw fastify.httpErrors.badRequest('地图 ID 只能用小写英文字母、数字和横线（2-60 个字符）');
    if (await findMission(id)) throw fastify.httpErrors.conflict(`已经有 ID 为 ${id} 的地图了`);
    const order = (await db.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM axsuck.missions')).rows[0].n;
    const row = (await db.query(`
      INSERT INTO axsuck.missions (id, name, description, credit, source_url, sort_order, content)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}
    `, [id, name, String(body.description || '').slice(0, META.description), String(body.credit || '').slice(0, META.credit), source.slice(0, META.source_url), order, content])).rows[0];
    await db.query(
      'INSERT INTO axsuck.mission_versions (mission_id, version, content, note, created_by) VALUES ($1, 1, $2, $3, $4)',
      [id, content, imported ? '从链接导入' : '上传', editor(req)],
    );
    return { mission: shape(row) };
  });

  fastify.patch('/missions/:id', async (req) => {
    requireAdmin(fastify, req);
    const body = req.body || {};
    const sets = [];
    const params = [req.params.id];
    for (const [key, max] of Object.entries(META)) {
      if (body[key] === undefined) continue;
      const value = String(body[key] ?? '').trim();
      if (key === 'name' && !value) throw fastify.httpErrors.badRequest('请填写地图名称');
      if (key === 'source_url' && value && sourceProblem(value)) throw fastify.httpErrors.badRequest(sourceProblem(value));
      params.push(value.slice(0, max));
      sets.push(`${key} = $${params.length}`);
    }
    if (body.hidden !== undefined) {
      params.push(Boolean(body.hidden));
      sets.push(`hidden = $${params.length}`);
    }
    if (body.sort_order !== undefined) {
      const n = Number(body.sort_order);
      if (!Number.isInteger(n) || Math.abs(n) > 100_000) throw fastify.httpErrors.badRequest('排序必须是整数');
      params.push(n);
      sets.push(`sort_order = $${params.length}`);
    }
    if (!sets.length) throw fastify.httpErrors.badRequest('没有要修改的内容');
    const row = (await db.query(`UPDATE axsuck.missions SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING ${COLUMNS}`, params)).rows[0];
    if (!row) throw fastify.httpErrors.notFound('没有这个地图');
    return { mission: shape(row) };
  });

  fastify.put('/missions/:id/content', async (req) => {
    requireAdmin(fastify, req);
    const body = req.body || {};
    const row = await findMission(req.params.id);
    if (!row) throw fastify.httpErrors.notFound('没有这个地图');
    if (Number(body.base_version) !== row.version) throw fastify.httpErrors.conflict('地图已经被别人改过了，请刷新后再改');
    let content;
    if (typeof body.content === 'string') {
      content = body.content;
      const problems = missionProblems(content);
      if (problems.length) throw fastify.httpErrors.badRequest(`地图文件读不出来：${problems[0]}`);
    } else {
      const limit = body.vehicle_limit === undefined ? undefined : Boolean(body.vehicle_limit);
      const limitBlock = limit === true ? await previousLimitBlock(row.id) : null;
      try {
        content = applyMissionEdits(row.content, { fields: body.fields || {}, units: body.units || null, vehicleLimit: limit, limitBlock });
      } catch (e) {
        throw fastify.httpErrors.badRequest(e.message);
      }
    }
    if (content === row.content) return { mission: shape(row), unchanged: true };
    const note = body.note
      || (typeof body.content === 'string' ? '修改原文'
        : body.vehicle_limit === false ? '关闭载具限制'
          : body.vehicle_limit === true && !missionSummary(row.content)?.vehicleLimit ? '开启载具限制'
            : body.units ? '修改载具' : '修改设置');
    const saved = await saveVersion(row.id, content, note, editor(req));
    return { mission: shape(saved) };
  });

  fastify.post('/missions/:id/revert', async (req) => {
    requireAdmin(fastify, req);
    const v = Number(req.body?.version);
    const row = await findMission(req.params.id);
    if (!row) throw fastify.httpErrors.notFound('没有这个地图');
    const old = (await db.query('SELECT content FROM axsuck.mission_versions WHERE mission_id = $1 AND version = $2', [row.id, v])).rows[0];
    if (!old) throw fastify.httpErrors.notFound('没有这个版本');
    if (old.content === row.content) return { mission: shape(row), unchanged: true };
    const saved = await saveVersion(row.id, old.content, `恢复到第 ${v} 版`, editor(req));
    return { mission: shape(saved) };
  });

  fastify.delete('/missions/:id', async (req) => {
    requireAdmin(fastify, req);
    const gone = (await db.query('DELETE FROM axsuck.missions WHERE id = $1 RETURNING id', [req.params.id])).rows[0];
    if (!gone) throw fastify.httpErrors.notFound('没有这个地图');
    await db.query('UPDATE axsuck.tournaments SET missions = array_remove(missions, $1) WHERE $1 = ANY(missions)', [gone.id]);
    return { success: true };
  });

  fastify.put('/tournaments/:id/missions', async (req) => {
    requireAdmin(fastify, req);
    const list = req.body?.missions;
    if (!Array.isArray(list)) throw fastify.httpErrors.badRequest('missions 必须是列表');
    const ids = [...new Set(list.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
    if (ids.length > MAX_EVENT_MISSIONS) throw fastify.httpErrors.badRequest(`一场赛事最多 ${MAX_EVENT_MISSIONS} 张地图`);
    if (ids.length) {
      const known = new Set((await db.query('SELECT id FROM axsuck.missions WHERE id = ANY($1)', [ids])).rows.map((r) => r.id));
      const missing = ids.filter((x) => !known.has(x));
      if (missing.length) throw fastify.httpErrors.badRequest(`没有这个地图：${missing.join(', ')}`);
    }
    const row = (await db.query('UPDATE axsuck.tournaments SET missions = $2, updated_at = NOW() WHERE id = $1 RETURNING missions', [req.params.id, ids])).rows[0];
    if (!row) throw fastify.httpErrors.notFound('Tournament not found');
    return { missions: row.missions };
  });
}
