// Vehicle pictures for the vehicle pool view: the War Thunder wiki's
// tech-tree slot images (static.encyclopedia.warthunder.com/slots/<unit>.png),
// its large unit pictures (images/<unit>.png, for the overlays) and country
// flags, downloaded once and kept on disk so players load them
// from this server. Misses are remembered for an hour.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WIKI_STATIC = 'https://static.encyclopedia.warthunder.com';
const MAX_BYTES = 8 * 1024 * 1024;
const MISS_MS = 60 * 60 * 1000;

export const defaultCacheDir = () =>
  process.env.VEHICLE_IMAGE_CACHE || join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'vehicle-images');

/** { url, file } for a request (kind 'slots', 'images' or 'country', file "<id>.png"), or null. */
export function imageSource(kind, file) {
  const m = /^([a-z0-9][a-z0-9_.-]{0,80})\.png$/i.exec(String(file || ''));
  if (!m || m[1].includes('..')) return null;
  const id = m[1];
  if (kind === 'slots') return { url: `${WIKI_STATIC}/slots/${id}.png`, file: `slots/${id}.png` };
  if (kind === 'images') return { url: `${WIKI_STATIC}/images/${id}.png`, file: `images/${id}.png` };
  if (kind === 'country') return /^[a-z]+$/.test(id) ? { url: `${WIKI_STATIC}/unit_tooltip/country_${id}.png`, file: `country/${id}.png` } : null;
  return null;
}

/** Image store: get(kind, file) -> Buffer or null (downloads on first use). */
export function vehicleImageStore({ dir = defaultCacheDir(), fetchImpl = fetch, now = () => Date.now(), log = null } = {}) {
  const misses = new Map(); // file -> time of the miss
  const pending = new Map();

  async function download(src) {
    const res = await fetchImpl(src.url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const type = res.headers?.get?.('content-type') || '';
    if (type && !type.startsWith('image/')) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (!body.length || body.length > MAX_BYTES) return null;
    const path = join(dir, src.file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.tmp`, body);
    await rename(`${path}.tmp`, path);
    return body;
  }

  async function get(kind, file) {
    const src = imageSource(kind, file);
    if (!src) return null;
    try {
      return await readFile(join(dir, src.file));
    } catch {
      // not cached yet
    }
    const missAt = misses.get(src.file);
    if (missAt !== undefined && now() - missAt < MISS_MS) return null;
    if (!pending.has(src.file)) {
      pending.set(src.file, download(src)
        .catch((err) => {
          log?.warn?.({ err: err.message, url: src.url }, 'vehicle image download failed');
          return null;
        })
        .then((body) => {
          if (!body) misses.set(src.file, now());
          pending.delete(src.file);
          return body;
        }));
    }
    return pending.get(src.file);
  }

  return { get };
}
