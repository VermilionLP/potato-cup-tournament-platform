#!/usr/bin/env bash
# Deploy the tournament platform to the live server.
#
# Usage (on the server, as the admin user):
#   bash scripts/deploy.sh --git [ref]     # deploy GitHub main (or a branch/tag/commit)
#   bash scripts/deploy.sh path/to/code.tar.gz
#
# Steps: backup (code + database) -> stage -> drift check -> dry run -> apply -> preflight
# migrations -> install/migrate/build -> try the new version on a spare port ->
# restart -> smoke tests. A migration preflight failure stops before anything
# is built or restarted. Once the code is applied, a failed build, a failed
# try on the spare port or failed smoke tests after the restart roll the code
# back automatically (the database is not rolled back; see the message).
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
# The QQ bots (apps/bot) run as their own PM2 process once scripts/bot-setup.sh
# has been followed; a deploy restarts them only if they are registered.
BOT_PM2_APP=potato-bot
restart_bot() {
  if pm2 describe "$BOT_PM2_APP" > /dev/null 2>&1; then
    pm2 restart "$BOT_PM2_APP" --update-env > /dev/null && echo "restarted $BOT_PM2_APP"
  fi
  return 0
}
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
  # Templates are code; real .env files stay on the server untouched.
  --include=.env.example
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

# The web build (SvelteKit 3 / Vite 8) needs Node 22.17 or newer: stop
# before anything changes on an older Node.
NODE_VERSION=$(node -v 2>/dev/null | sed 's/^v//')
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=17)?0:1)' 2>/dev/null; then
  echo "FAILED: Node ${NODE_VERSION:-not found} is too old; the site needs Node 22.17 or newer."
  echo "        Upgrade Node (e.g. nvm install 22 && nvm alias default 22), then run the deploy again."
  exit 1
fi

echo "==> 1/10 backup current code and database"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
tar -czf "$BACKUP_DIR/suck-code-${STAMP}.tar.gz" \
  --exclude=node_modules --exclude=.git --exclude='apps/web/build' \
  --exclude='apps/web/.svelte-kit' \
  -C /home/admin suck
ls -lh "$BACKUP_DIR/suck-code-${STAMP}.tar.gz"
# Keep the newest 20 code backups.
ls -1t "$BACKUP_DIR"/suck-code-*.tar.gz | tail -n +21 | xargs -r rm -f
# Database: the backup script of the code being replaced (or of this
# checkout on the first run). SKIP_DB_BACKUP=1 skips it, e.g. when
# pg_dump is not installed yet.
if [ "${SKIP_DB_BACKUP:-}" = "1" ]; then
  echo "database backup skipped (SKIP_DB_BACKUP=1)"
else
  DB_BACKUP_SCRIPT="$TARGET/scripts/backup-db.sh"
  [ -f "$DB_BACKUP_SCRIPT" ] || DB_BACKUP_SCRIPT="$(dirname "$0")/backup-db.sh"
  TARGET="$TARGET" BACKUP_DIR="$BACKUP_DIR" bash "$DB_BACKUP_SCRIPT" pre-deploy || {
    echo "database backup failed, nothing changed (rerun with SKIP_DB_BACKUP=1 to deploy without it)"
    exit 1
  }
fi

echo "==> 2/10 stage new code"
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

echo "==> 3/10 check for edits made directly on the server"
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

echo "==> 4/10 dry run (nothing is written yet)"
CHANGES=$(changed_files "$STAGING" "$TARGET")
if [ -z "$CHANGES" ]; then
  echo "no file content changes"
else
  echo "$CHANGES"
fi
# Files deleted from the repo since the last deployed commit: rsync only
# adds and updates, so without this they would stay on the server (e.g. a
# stale svelte.config.js breaks the SvelteKit 3 build).
DELETED=""
if [ -n "${LAST_COMMIT:-}" ] && [ -d "$STAGING/.git" ] && git -C "$STAGING" cat-file -e "${LAST_COMMIT}^{commit}" 2>/dev/null; then
  while IFS= read -r f; do
    [ -n "$f" ] && [ -e "$TARGET/$f" ] && [ ! -e "$STAGING/$f" ] && DELETED+="$f"$'\n'
  done < <(git -C "$STAGING" diff --no-renames --name-only --diff-filter=D "$LAST_COMMIT" HEAD)
fi
if [ -n "$DELETED" ]; then
  printf '%s' "$DELETED" | sed 's/^/*deleting /'
fi

echo
read -r -p "Apply the changes above? [y/N] " ans
if [ "$ans" != "y" ]; then
  echo "aborted, nothing changed"
  exit 1
fi

echo "==> 5/10 apply"
LAST_DEPLOYED=$(cat "$DEPLOYED_MARKER" 2>/dev/null || true)
rsync "${RSYNC_OPTS[@]}" -c "$STAGING"/ "$TARGET"/
if [ -n "$DELETED" ]; then
  printf '%s' "$DELETED" | while IFS= read -r f; do rm -f -- "$TARGET/$f"; done
  echo "deleted $(printf '%s' "$DELETED" | grep -c .) file(s) removed from the repo"
fi
echo "applied $(printf '%s\n' "$CHANGES" | grep -c . || true) file(s)"

# The smoke test of the new code, kept outside the tree so a rollback can use it.
SMOKE=$(mktemp)
cp "$STAGING/scripts/smoke.sh" "$SMOKE" 2>/dev/null || SMOKE=""
smoke() { if [ -z "$SMOKE" ]; then echo "(no scripts/smoke.sh, skipped)"; return 0; fi; bash "$SMOKE" "$1"; }

# Waits up to a minute for the API to answer after a (re)start; a busy
# server can take longer than a few seconds.
wait_for_api() {
  for _ in $(seq 1 60); do
    curl -sf "$1/api/ping" > /dev/null && return 0
    sleep 1
  done
  return 1
}

# Puts the previous code back (from this deploy's backup), reinstalls,
# rebuilds and restarts. The database stays as migrated.
ROLLING_BACK=0
rollback() {
  [ "$ROLLING_BACK" = 1 ] && return
  ROLLING_BACK=1
  set +e
  echo
  echo "==> ROLLING BACK to the code before this deploy"
  tar -xzf "$BACKUP_DIR/suck-code-${STAMP}.tar.gz" -C /home/admin
  cd "$TARGET" || return
  pnpm install --frozen-lockfile
  NODE_OPTIONS=--max-old-space-size=1024 pnpm build:web
  pm2 restart "$PM2_APP" --update-env
  restart_bot
  if [ -n "$LAST_DEPLOYED" ]; then echo "$LAST_DEPLOYED" > "$DEPLOYED_MARKER"; else rm -f "$DEPLOYED_MARKER"; fi
  wait_for_api http://localhost:3100
  if smoke http://localhost:3100; then
    echo "ROLLED BACK: the site runs the previous version again."
  else
    echo "ROLLBACK DONE BUT SMOKE TESTS STILL FAIL: check 'pm2 logs $PM2_APP'."
  fi
  echo "Migrations applied by this deploy were not undone. If one changed data, restore"
  echo "the newest $BACKUP_DIR/db/suck-db-*-pre-deploy.dump (see scripts/backup-db.sh)."
}

echo "==> 6/10 preflight migrations (real pg driver, every statement rolled back)"
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

echo "==> 7/10 install, migrate, build"
cd "$TARGET"
if ! { pnpm install --frozen-lockfile && pnpm migrate && NODE_OPTIONS=--max-old-space-size=1024 pnpm build:web; }; then
  echo "install / migrate / build failed"
  rollback
  exit 1
fi

echo "==> 8/10 try the new version on port 3101 (background jobs off)"
PRE_LOG=$(mktemp)
(cd "$TARGET/apps/api" && PORT=3101 BACKGROUND_JOBS=off ES_ENABLED=false exec node app.js) > "$PRE_LOG" 2>&1 &
PRE_PID=$!
PRE_OK=0
for _ in $(seq 1 40); do
  if curl -sf localhost:3101/api/ping > /dev/null; then PRE_OK=1; break; fi
  kill -0 "$PRE_PID" 2>/dev/null || break
  sleep 1
done
if [ "$PRE_OK" = 1 ] && smoke http://localhost:3101; then
  PRE_OK=1
else
  PRE_OK=0
fi
kill "$PRE_PID" 2>/dev/null || true
wait "$PRE_PID" 2>/dev/null || true
if [ "$PRE_OK" != 1 ]; then
  echo "the new version failed on port 3101; its log:"
  tail -n 40 "$PRE_LOG"
  rm -f "$PRE_LOG"
  rollback
  exit 1
fi
rm -f "$PRE_LOG"

echo "==> 9/10 restart"
pm2 restart "$PM2_APP" --update-env
restart_bot
if [ -n "$NEW_COMMIT" ]; then
  echo "$NEW_COMMIT" > "$DEPLOYED_MARKER"
fi
wait_for_api http://localhost:3100 || true
pm2 logs "$PM2_APP" --lines 15 --nostream

echo
echo "==> 10/10 smoke tests"
if ! smoke http://localhost:3100; then
  echo "SMOKE TESTS FAILED after the restart"
  rollback
  exit 1
fi
rm -f "$SMOKE"
echo "deploy finished${NEW_COMMIT:+ at ${NEW_COMMIT:0:7}}"
