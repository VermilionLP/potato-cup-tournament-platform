# AI Guide: suck-tournament-api

## Role

`apps/api` is the Potato Cup (WarThunder) tournament API. Fastify 5, PostgreSQL via `@fastify/postgres`, Postgrator migrations, SSE (`@fastify/sse`), and Swagger.

Read this guide before editing files under `apps/api`.

## Hard Rules

- Use ESM modules.
- Use parameterized SQL only.
- All tables live in the `axsuck` schema. Qualify table names as `axsuck.<table>` in SQL.
- Routes are plain async functions and must not be wrapped with `fastify-plugin`.
- `plugins/database.js` is the shared plugin; it decorates `fastify.db` (aliased to `fastify.pg`) and runs migrations on startup.
- Repositories are factory functions named `XxxRepo(db)` under `repositories/`.
- Add `do` and `undo` migrations together for every schema change.
- Use `fastify.httpErrors` (from `@fastify/sensible`) for HTTP errors.
- Client identity comes from the `x-player-id` and `x-qq-group` request headers, not JWT; once an ID is bound to a device key (`lib/player-key.js`), self-service requests also need `x-player-key`.
- Admin-only destructive routes call `requireAdmin(fastify, req)` from `lib/admin.js`; the token comes from `ADMIN_TOKEN` and the `x-admin-token` header. Never allow admin access when `ADMIN_TOKEN` is unset.
- Self-service routes call `requireSelfOrAdmin(fastify, req, playerId)` and match result reporting calls `requireMatchPlayerOrAdmin(fastify, req, match)`, so ordinary users can only act on their own player ID or their own match.
- API request/audit logs ship to Elasticsearch through `lib/es-logger.js` (`ES_*` env vars); keep logging non-blocking.
- This app is a root pnpm workspace package. Do not add a local `pnpm-lock.yaml` or `pnpm-workspace.yaml`; run installs from the repository root.

## Architecture

```text
Route (routes/*.js)
  -> Repository factory (repositories/*-repo.js)
    -> fastify.db.query(...)
```

- Routes live in `routes/`. Events are split by area: `tournaments.js` (list, detail, SSE, calendars, create, delete), `tournament-settings.js` (PATCH, status, Swiss rounds, playoffs), `tournament-bracket.js` (seeds, bracket, live match, overlay state) and `tournament-import.js`; keep route handlers thin and put pure logic in `lib/` (e.g. `lib/tournament-detail.js` builds `GET /tournaments/:id`).
- Repositories live in `repositories/`. `match-repo.js` composes `repositories/match/` (queries, generation, progression, rows). Multi-statement writes go through `inTransaction(db, fn)` from `lib/transaction.js`, not hand-written BEGIN / COMMIT.
- Player routes: `players.js` (profiles, rename, merge, delete), `player-keys.js`, `registrations.js`, `player-stats.js` (statistics computed by `lib/player-statistics.js`).
- Ladder ratings and the statistics page data are cached in memory (`lib/ladder-cache.js`, per division / scope, 5 min TTL). Any successful non-GET request drops the cache (hook in `app.js`); code that changes matches, players or events outside a request (scripts, timers) must call `invalidateLadder(db)` or wait for the TTL. Don't mutate what `getRatings` returns from the cache (`history`, `games`).
- Migrations live in `migrations/` (`{NNN}.do.description.sql` + `{NNN}.undo.description.sql`).
- Utility and migration scripts live in `scripts/`.
- The API is served under the `/api` prefix; Swagger UI is at `/docs`.

## Database

- Schema: `axsuck` (with `search_path = axsuck, public`).
- Primary keys are `TEXT` unless an existing table says otherwise.
- Timestamps use `TIMESTAMPTZ DEFAULT NOW()`.
- `DATABASE_URL` is required and read from `apps/api/.env`.

## Verification Commands

- Lint/typecheck: none defined.
- Tests: `pnpm --filter suck-tournament-api test` (`node --test`, no DB needed; `test/route-permissions.test.js` calls every route through `test/helpers/route-harness.js` and checks who may write — add new self-service routes to its `SELF_WRITES`); smoke test `node scripts/test-api.js` (manual, needs a reachable `DATABASE_URL`).
- Build: none (plain ESM Node, `node app.js`).
- Dev server: `pnpm --filter suck-tournament-api dev` (port 3100); web + API via `pnpm dev:suck`.
- Migrations: `pnpm --filter suck-tournament-api migrate`
- Swagger docs: `http://localhost:3100/docs`

## Definition of Done

This app's work is done only when:

- `pnpm --filter suck-tournament-api test` passes; the smoke test or an equivalent manual API check passes against a real database when routes or SQL changed.
- New or changed `do` migrations have a matching `undo` migration.
- The change follows the Hard Rules and architecture above.
