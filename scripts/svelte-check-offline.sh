#!/usr/bin/env bash
# Compile the web app's .svelte files (and .svelte.js modules) with the
# Svelte compiler version locked in pnpm-lock.yaml, without npm.
#
# For sandboxes that can reach GitHub but not the npm registry (e.g. AI
# coding sessions): the compiler and its plain-JS dependencies are cloned
# from GitHub into a cache, and the few dependencies that only matter for
# TypeScript, source maps and a11y data are replaced by small stubs (so a11y
# warnings are not reported). It reports compile errors only; with
# node_modules installed, `pnpm build:web` is the full check.
#
# Usage: bash scripts/svelte-check-offline.sh [file...]   (default: all)

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CACHE="${SVELTE_CHECK_CACHE:-${TMPDIR:-/tmp}/svelte-check-offline}"

locked() {
  grep -m1 -oE "^  $1@[0-9][^:(]*" "$ROOT/pnpm-lock.yaml" | sed "s/^  $1@//" || true
}

SVELTE=$(locked svelte)
[ -n "$SVELTE" ] || { echo "svelte not found in pnpm-lock.yaml"; exit 1; }
ACORN=$(locked acorn); ACORN=${ACORN:-8.19.0}
ESRAP=$(locked esrap); ESRAP=${ESRAP:-2.4.0}
ZIMMERFRAME=$(locked zimmerframe); ZIMMERFRAME=${ZIMMERFRAME:-1.1.5}
LOCATE=$(locked locate-character); LOCATE=${LOCATE:-3.0.0}
ISREF=$(locked is-reference); ISREF=${ISREF:-3.0.3}

STAMP="svelte-$SVELTE"
BASE="$CACHE/$STAMP"

# clone <dir> <github repo> <tag>
clone() {
  [ -d "$BASE/src/$1/.git" ] && return 0
  echo "fetching $2 $3"
  GIT_TERMINAL_PROMPT=0 git -c advice.detachedHead=false clone -q --depth 1 --branch "$3" \
    "https://github.com/$2" "$BASE/src/$1"
}

# shim <package> <index.js source>
shim() {
  mkdir -p "$BASE/node_modules/$1"
  printf '{"name":"%s","type":"module","exports":{".":"./index.js"}}\n' "$1" > "$BASE/node_modules/$1/package.json"
  printf '%s\n' "$2" > "$BASE/node_modules/$1/index.js"
}

if [ ! -f "$BASE/.ready" ]; then
  mkdir -p "$BASE/src" "$BASE/node_modules"
  clone svelte sveltejs/svelte "svelte@$SVELTE"
  clone acorn acornjs/acorn "$ACORN"
  clone esrap sveltejs/esrap "v$ESRAP"
  clone zimmerframe Rich-Harris/zimmerframe "v$ZIMMERFRAME"
  clone locate-character Rich-Harris/locate-character "v$LOCATE"
  clone is-reference Rich-Harris/is-reference "v$ISREF"
  clone estree-walker Rich-Harris/estree-walker v3.0.3
  # 0.30.11 is the last magic-string release written in plain JS.
  clone magic-string Rich-Harris/magic-string v0.30.11

  S="$BASE/src"
  ln -sfn "$S/svelte/packages/svelte" "$BASE/node_modules/svelte"
  ln -sfn "$S/esrap" "$BASE/node_modules/esrap"
  shim acorn "export * from '$S/acorn/acorn/src/index.js';"
  shim zimmerframe "export * from '$S/zimmerframe/src/walk.js';"
  shim locate-character "export * from '$S/locate-character/src/index.js';"
  shim is-reference "export { default } from '$S/is-reference/src/index.js';"
  shim estree-walker "export * from '$S/estree-walker/src/index.js';"
  shim magic-string "export { default, Bundle, SourceMap } from '$S/magic-string/src/index.js';"
  shim esm-env "export const DEV = false, BROWSER = false, NODE = true;"
  shim clsx "export function clsx(...a) { return a.flat(Infinity).filter(Boolean).join(' '); } export default clsx;"
  shim devalue "export const uneval = (v) => JSON.stringify(v), stringify = JSON.stringify, parse = JSON.parse;"
  shim @sveltejs/acorn-typescript "export const tsPlugin = () => (Parser) => Parser;"
  shim @jridgewell/remapping "export default function remapping(maps) { return Array.isArray(maps) ? maps[0] : maps; }"
  shim @ampproject/remapping "export default function remapping(maps) { return Array.isArray(maps) ? maps[0] : maps; }"
  MAPLIKE="class M { constructor() { this.m = new Map(); } keys() { return [...this.m.keys()]; } values() { return [...this.m.values()]; } entries() { return [...this.m.entries()]; } get(k) { return this.m.get(k); } has(k) { return this.m.has(k); } forEach(f) { this.m.forEach(f); } }"
  shim aria-query "$MAPLIKE
export const roles = new M(), aria = new M(), elementRoles = new M(), dom = new M();"
  shim axobject-query "$MAPLIKE
export const AXObjects = new M(), AXObjectRoles = new M(), elementAXObjects = new M(), AXObjectElements = new M();"
  shim @jridgewell/sourcemap-codec "const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const vlq = (n) => { let v = n < 0 ? (-n << 1) | 1 : n << 1, s = ''; do { let d = v & 31; v >>>= 5; if (v > 0) d |= 32; s += C[d]; } while (v > 0); return s; };
export function encode(lines) { const st = [0, 0, 0, 0, 0]; return lines.map((segs) => { st[0] = 0; return segs.map((seg) => seg.map((x, i) => { const out = vlq(x - st[i]); st[i] = x; return out; }).join('')).join(','); }).join(';'); }
export function decode(str) { const map = {}; [...C].forEach((c, i) => (map[c] = i)); const st = [0, 0, 0, 0, 0]; return str.split(';').map((line) => { st[0] = 0; return line ? line.split(',').map((seg) => { const out = []; let v = 0, sh = 0; for (const ch of seg) { const d = map[ch]; v += (d & 31) << sh; if (d & 32) { sh += 5; continue; } const neg = v & 1; v >>>= 1; const i = out.length; st[i] += neg ? -v : v; out.push(st[i]); v = 0; sh = 0; } return out; }) : []; }); }"
  touch "$BASE/.ready"
fi

cp "$ROOT/scripts/svelte-check-offline.mjs" "$BASE/check.mjs"
cd "$ROOT/apps/web"
if [ $# -eq 0 ]; then
  mapfile -t FILES < <(find src -name '*.svelte' -o -name '*.svelte.js' | sort)
else
  FILES=("$@")
fi
echo "svelte $SVELTE: compiling ${#FILES[@]} file(s)"
node "$BASE/check.mjs" "${FILES[@]}"
