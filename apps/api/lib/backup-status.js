// Database backups as admins see them on /admin: the dumps
// scripts/backup-db.sh writes to $BACKUP_DIR/db (the API runs on the same
// server, as the same user), whether the daily cron line is installed, a
// check that a dump can be read back (pg_restore --list), and a backup on
// demand. Nothing here deletes or restores anything.

import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STALE_MS = 36 * 60 * 60 * 1000;
const FILE = /^suck-db-(\d{8})-(\d{6})-([a-z0-9-]+)\.dump$/;
const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/backup-db.sh');

export const backupDir = () => path.join(process.env.BACKUP_DIR || '/home/admin/suck-backups', 'db');

/** { label, at } from a dump's file name, or null for other files. */
export function parseBackupName(name) {
  const m = FILE.exec(name);
  if (!m) return null;
  const [d, t] = [m[1], m[2]];
  // The name carries the server's local time; the file's mtime is used for "when".
  return { label: m[3], stamp: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)} ${t.slice(0, 2)}:${t.slice(2, 4)}` };
}

/**
 * The summary from a directory listing [{ name, size, mtime }]: newest
 * first, the newest overall and the newest daily one, stale when the newest
 * is older than STALE_MS.
 */
export function summarize(files = [], now = Date.now()) {
  const dumps = files
    .map((f) => ({ ...f, ...parseBackupName(f.name) }))
    .filter((f) => f.label)
    .sort((a, b) => b.mtime - a.mtime)
    .map((f) => ({ file: f.name, label: f.label, size: f.size, at: new Date(f.mtime).toISOString() }));
  const latest = dumps[0] || null;
  return {
    count: dumps.length,
    latest,
    latestDaily: dumps.find((d) => d.label === 'daily') || null,
    recent: dumps.slice(0, 10),
    stale: !latest || now - Date.parse(latest.at) > STALE_MS,
  };
}

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10_000, maxBuffer: 4 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
      resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });

/** Whether the daily cron line is in this user's crontab (null: can't tell). */
export async function dailyCronInstalled() {
  const r = await run('crontab', ['-l'], { timeout: 3000 });
  if (r.code === 'ENOENT') return null;
  if (!r.ok) return /no crontab/i.test(r.stderr) ? false : null;
  return r.stdout.includes('scripts/backup-db.sh daily');
}

export async function backupStatus(now = Date.now()) {
  const dir = backupDir();
  let files = [];
  let readable = true;
  try {
    const names = await readdir(dir);
    files = await Promise.all(
      names.filter((n) => FILE.test(n)).map(async (name) => {
        const s = await stat(path.join(dir, name));
        return { name, size: s.size, mtime: s.mtimeMs };
      }),
    );
  } catch {
    readable = false;
  }
  return { dir, readable, cron: await dailyCronInstalled(), ...summarize(files, now) };
}

/** Reads a dump's table of contents: { ok, tables } (tables with data). */
export async function verifyBackup(file) {
  if (!FILE.test(String(file || ''))) return { ok: false, error: '备份文件名无效' };
  const r = await run('pg_restore', ['--list', path.join(backupDir(), file)], { timeout: 60_000 });
  if (r.code === 'ENOENT') return { ok: false, error: '服务器上没有 pg_restore（安装 PostgreSQL 客户端）' };
  if (!r.ok) return { ok: false, error: (r.stderr || '读取失败').trim().split('\n')[0] };
  const tables = r.stdout.split('\n').filter((l) => / TABLE DATA /.test(l)).length;
  return { ok: tables > 0, tables, error: tables > 0 ? '' : '备份里没有数据表' };
}

let running = null;
/** Runs scripts/backup-db.sh manual once at a time: { ok, output }. */
export function backupNow() {
  running ??= run('bash', [SCRIPT, 'manual'], { timeout: 5 * 60_000, env: { ...process.env, KEEP: process.env.BACKUP_KEEP_MANUAL || '10' } })
    .then((r) => ({ ok: r.ok, output: (r.stdout + r.stderr).trim().split('\n').slice(-3).join('\n') }))
    .finally(() => {
      running = null;
    });
  return running;
}
