// Mission files for War Thunder custom battles ("Missions by URL"): the game
// takes a direct link to a mission .blk, so GET /api/missions/<name>.blk
// returns the file as text. Files live outside the deployed code (deploys
// rsync over it): MISSIONS_DIR, default ~/potato-missions. Each download is
// logged with its address and user agent (to see whether the game client or
// Gaijin's servers fetch the link). A first step towards a 比赛地图 page with
// admin editing.

import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const MISSION_FILE = /^[a-z0-9][a-z0-9_-]{0,79}\.blk$/i;
const MAX_BYTES = 2 * 1024 * 1024;

export const missionsDir = () => process.env.MISSIONS_DIR || join(homedir(), 'potato-missions');

export default async function missionsRoutes(fastify) {
  const serve = async (req, reply) => {
    const { file } = req.params;
    if (!MISSION_FILE.test(file)) throw fastify.httpErrors.notFound('没有这个地图文件');
    const path = join(missionsDir(), file);
    let info;
    try {
      info = await stat(path);
    } catch {
      throw fastify.httpErrors.notFound('没有这个地图文件');
    }
    if (!info.isFile() || info.size > MAX_BYTES) throw fastify.httpErrors.notFound('没有这个地图文件');
    req.log.info({ mission: file, ip: req.ip, forwardedFor: req.headers['x-forwarded-for'], ua: req.headers['user-agent'] || '', method: req.method }, 'mission file requested');
    reply
      .header('content-type', 'text/plain; charset=utf-8')
      .header('content-disposition', `inline; filename="${file}"`)
      .header('cache-control', 'no-cache')
      .header('access-control-allow-origin', '*')
      .header('last-modified', info.mtime.toUTCString());
    return reply.send(await readFile(path));
  };
  // Fastify answers HEAD from this too.
  fastify.get('/missions/:file', serve);
}
