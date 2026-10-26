#!/usr/bin/env bash
# Deploy the tournament platform to the live server.
#
# Usage (on the server, as the admin user):
#   bash scripts/deploy.sh --git [ref]     # deploy GitHub main (or a branch/tag/commit)
#   bash scripts/deploy.sh path/to/code.tar.gz
#
# Steps: backup -> stage -> drift check -> dry run -> apply -> preflight
# migrations -> install/migrate/build -> restart -> smoke tests.
# Any failure stops the script before the running service is restarted.
#
# History: v2 added the migration preflight after migration 008 failed on
# Postgrator because the file started with a UTF-8 BOM (psql skips the BOM,
# Postgrator sends it to Postgres verbatim).

set -euo pipefail

REPO_URL="${REPO_URL:-git@github-potato:VermilionLP/potato-cup-tournament-platform.git}"
STAGING=/home/admin/suck-staging
TARGET=/home/admin/suck
BACKUP_DIR=/home/admin/suck-backups
PM2_APP=suck-tournament
PREFLIGHT="$TARGET/apps/api/.deploy-preflight.mjs"
DEPLOYED_MARKER="$TARGET/.deployed-commit"

usage() {
  echo "usage: $0 --git [ref] | $0 <archive.tar.gz>"
  exit 1
}

[ $# -ge 1 ] || usage
[ -d "$TARGET" ] || { echo "target not found: $TARGET"; exit 1; }

MODE="$1"
REF="main"
ARCHIVE=""
if [ "$MODE" = "--git" ]; then
  REF="${2:-main}"
else
  ARCHIVE="$1"
  [ -f "$ARCHIVE" ] || { echo "archive not found: $ARCHIVE"; exit 1; }
fi

DRIFT_DIR=""
cleanup() {
  rm -f "$PREFLIGHT"
  [ -n "$DRIFT_DIR" ] && rm -rf "$DRIFT_DIR"
  return 0
}
trap cleanup EXIT

RSYNC_OPTS=(
  -a
  --exclude=node_modules
  --exclude=.git
  --exclude=.env
  --exclude='.env.*'
  --exclude=apps/web/build
  --exclude=apps/web/.svelte-kit
  --exclude=.deployed-commit
)

# Lists files whose content differs; ignores timestamp-only and directory lines.
changed_files() {
  rsync "${RSYNC_OPTS[@]}" -n -c -i "$1"/ "$2"/ | grep -Ev '^\.(d|f)' || true
}

echo "==> 1/9 backup current code"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
tar -czf "$BACKUP_DIR/suck-code-${STAMP}.tar.gz" \
  --exclude=node_modules --exclude=.git --exclude='apps/web/build' \
  --exclude='apps/web/.svelte-kit' \
  -C /home/admin suck
ls -lh "$BACKUP_DIR/suck-code-${STAMP}.tar.gz"

echo "==> 2/9 stage new code"
rm -rf "$STAGING"
mkdir -p "$STAGING"
NEW_COMMIT=""
if [ -n "$ARCHIVE" ]; then
  tar -xzf "$ARCHIVE" -C "$STAGING"
  echo "staged archive $ARCHIVE"
else
  git clone --quiet "$REPO_URL" "$STAGING"
  git -C "$STAGING" checkout --quiet "$REF"
  NEW_COMMIT=$(git -C "$STAGING" rev-parse HEAD)
  echo "staged $REF at $(git -C "$STAGING" log -1 --format='%h %s')"
fi
[ -f "$STAGING/package.json" ] || { echo "staged code has no package.json at its root"; exit 1; }

echo "==> 3/9 check for edits made directly on the server"
if [ -f "$DEPLOYED_MARKER" ] && [ -d "$STAGING/.git" ]; then
  LAST_COMMIT=$(cat "$DEPLOYED_MARKER")
  if git -C "$STAGING" cat-file -e "${LAST_COMMIT}^{commit}" 2>/dev/null; then
    DRIFT_DIR=$(mktemp -d)
    git -C "$STAGING" archive "$LAST_COMMIT" | tar -x -C "$DRIFT_DIR"
    DRIFT=$(changed_files "$DRIFT_DIR" "$TARGET" | grep -E '^>f' || true)
    if [ -n "$DRIFT" ]; then
      echo "WARNING: these files on the server differ from the last deployed commit"
      echo "${LAST_COMMIT:0:7}. Deploying will overwrite them; commit them to GitHub first"
      echo "if they should be kept:"
      echo "$DRIFT" | awk '{print "  " $2}'
    else
      echo "none since ${LAST_COMMIT:0:7}"
    fi
  else
    echo "last deployed commit ${LAST_COMMIT:0:7} not found in the repo, skipping"
  fi
else
  echo "skipped (needs --git mode and a previous --git deploy)"
fi

echo "==> 4/9 dry run (nothing is written yet)"
CHANGES=$(changed_files "$STAGING" "$TARGET")
if [ -z "$CHANGES" ]; then
  echo "no file content changes"
else
  echo "$CHANGES"
fi

echo
read -r -p "Apply the changes above? [y/N] " ans
if [ "$ans" != "y" ]; then
  echo "aborted, nothing changed"
  exit 1
fi

echo "==> 5/9 apply"
rsync "${RSYNC_OPTS[@]}" -c "$STAGING"/ "$TARGET"/
echo "applied $(printf '%s\n' "$CHANGES" | grep -c . || true) file(s)"

echo "==> 6/9 preflight migrations (real pg driver, every statement rolled back)"
cat > "$PREFLIGHT" <<'PREFLIGHT_JS'
import fs from 'node:fs';
import pg from 'pg';

const [mode, ...files] = process.argv.slice(2);
const hasBom = (buf) =>
  buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;

if (mode === 'check') {
  let bad = 0;
  for (const file of files) {
    const buf = fs.readFileSync(file);
    if (hasBom(buf)) {
      console.error(`BOM      ${file}`);
      bad += 1;
    } else if (buf.includes(0x00)) {
      console.error(`NUL byte ${file}`);
      bad += 1;
    }
  }
  if (bad) {
    console.error(`${bad} migration file(s) would break Postgrator`);
    process.exit(1);
  }
  console.log(`ok       ${files.length} migration files have no BOM / NUL bytes`);
  process.exit(0);
}

if (mode !== 'run-pending' || files.length === 0) {
  console.error('usage: preflight check <files...> | preflight run-pending <files...>');
  process.exit(1);
}

const env = {};
let envText = '';
try {
  envText = fs.readFileSync('.env', 'utf8');
} catch (_) {
  console.warn('warning: apps/api/.env is not readable, relying on the environment');
}
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
  const i = trimmed.indexOf('=');
  env[trimmed.slice(0, i).trim()] = trimmed
    .slice(i + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;
if (!connectionString) {
  console.error('FAILED: DATABASE_URL is not set');
  process.exit(1);
}

const client = new pg.Client({ connectionString });
try {
  await client.connect();
} catch (err) {
  console.error('FAILED: cannot connect to the database:', err.message);
  process.exit(1);
}

let applied = 0;
try {
  const res = await client.query(
    'SELECT COALESCE(MAX(version), 0) AS version FROM axsuck.schemaversion',
  );
  applied = Number(res.rows[0].version) || 0;
} catch (_) {
  applied = 0; // no schemaversion table yet
}
console.log(`database is at migration ${applied}`);

const pending = files
  .map((file) => ({ file, version: parseInt(file.split('/').pop().slice(0, 3), 10) }))
  .filter((entry) => entry.version > applied)
  .sort((a, b) => a.version - b.version);

if (pending.length === 0) {
  console.log('nothing pending');
  await client.end();
  process.exit(0);
}

let failed = false;
for (const { file } of pending) {
  const raw = fs.readFileSync(file);
  if (hasBom(raw)) {
    console.error(`FAILED: ${file} starts with a UTF-8 BOM (Postgrator cannot run it)`);
    failed = true;
    break;
  }
  try {
    await client.query('BEGIN');
    await client.query(raw.toString('utf8'));
    await client.query('ROLLBACK');
    console.log(`ok (rolled back) ${file}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`FAILED: ${file}: ${err.message}`);
    failed = true;
    break;
  }
}

await client.end();
process.exit(failed ? 1 : 0);
PREFLIGHT_JS

chmod 0644 "$PREFLIGHT"
cd "$TARGET/apps/api"
node "$PREFLIGHT" check migrations/*.sql
node "$PREFLIGHT" run-pending migrations/*.do.*.sql || {
  echo "preflight stopped, database untouched (code is applied but the service was not restarted)"
  exit 1
}

echo "==> 7/9 install, migrate, build"
cd "$TARGET"
pnpm install --frozen-lockfile
pnpm migrate
NODE_OPTIONS=--max-old-space-size=1024 pnpm build:web

echo "==> 8/9 restart"
pm2 restart "$PM2_APP" --update-env
if [ -n "$NEW_COMMIT" ]; then
  echo "$NEW_COMMIT" > "$DEPLOYED_MARKER"
fi
sleep 3
pm2 logs "$PM2_APP" --lines 15 --nostream

echo
echo "==> 9/9 smoke tests"
FAILED=0
check() {
  local label="$1" url="$2" expect="$3" code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url" || echo 000)
  if [ "$code" = "$expect" ]; then
    printf '%-20s %s ok\n' "$label" "$code"
  else
    printf '%-20s %s (expected %s)\n' "$label" "$code" "$expect"
    FAILED=1
  fi
}
check ping               localhost:3100/api/ping               200
check players            localhost:3100/api/players            200
check players/statistics localhost:3100/api/players/statistics 200
check tournaments        localhost:3100/api/tournaments        200
check "flag cn.svg"      localhost:3100/flags/cn.svg           200

echo
if [ "$FAILED" -ne 0 ]; then
  echo "SMOKE TESTS FAILED. Roll back with:"
  echo "  tar -xzf $BACKUP_DIR/suck-code-${STAMP}.tar.gz -C /home/admin && cd $TARGET && pnpm build:web && pm2 restart $PM2_APP"
  exit 1
fi
echo "deploy finished${NEW_COMMIT:+ at ${NEW_COMMIT:0:7}}"
