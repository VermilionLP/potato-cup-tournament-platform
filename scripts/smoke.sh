#!/usr/bin/env bash
# Smoke test of a running server: the web app (page, a hashed script,
# static files), the API and the API docs.
#
#   bash scripts/smoke.sh http://localhost:3100
#
# Exits 1 if any check fails. Used by the deploy (before and after the
# restart) and by CI (.github/workflows/ci.yml).

set -uo pipefail
BASE="${1:-http://localhost:3100}"
BASE="${BASE%/}"
FAILED=0

check() {
  local label="$1" path="$2" expect="${3:-200}" code
  code=$(curl -s -o /dev/null -L -w '%{http_code}' --max-time 20 "$BASE$path" || echo 000)
  if [ "$code" = "$expect" ]; then
    printf '%-22s %s ok\n' "$label" "$code"
  else
    printf '%-22s %s (expected %s)  %s\n' "$label" "$code" "$expect" "$BASE$path"
    FAILED=1
  fi
}

check "page /"               /
check "page (SPA route)"     /tournament/smoke-test
check "api ping"             /api/ping
check "api tournaments"      /api/tournaments
check "api players"          /api/players
check "api statistics"       /api/players/statistics
check "api vehicle pools"    /api/vehicle-pools
check "api docs"             /docs
check "flag cn.svg"          /flags/cn.svg
check "wt-units.json"        /wt-units.json

# A hashed script the page loads (catches broken static serving / builds).
ASSET=$(curl -s --max-time 20 "$BASE/" | grep -o '/_app/immutable/[^"]*\.js' | head -1)
if [ -n "$ASSET" ]; then
  check "script $(basename "$ASSET" | cut -c1-12)…" "$ASSET"
else
  printf '%-22s missing from the page\n' "hashed script"
  FAILED=1
fi

# Compression (informational): pre-compressed page, compressed API JSON.
enc() { curl -s -o /dev/null -D - -H 'Accept-Encoding: br, gzip' --max-time 20 "$BASE$1" | tr -d '\r' | grep -i '^content-encoding:' | cut -d' ' -f2; }
printf '%-22s %s\n' "compression page" "$(enc / || true)"
printf '%-22s %s\n' "compression api" "$(enc /api/players/statistics || true)"

exit "$FAILED"
