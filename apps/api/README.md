# suck-tournament-api

Standalone StarCraft 2 tournament API: Fastify 5 on PostgreSQL (schema `axsuck`), with Postgrator migrations, SSE live updates, Swagger docs, and an optional Python SC2 replay parser.

This app lives in the `suck-utilities` repository; see the root `README.md`.

## Commands

Run from the repository root with pnpm:

- Dev server (`http://localhost:3100`, docs at `/docs`): `pnpm dev:suck` (with the web app) or run this package directly
- Migrations: `pnpm --filter suck-tournament-api migrate`
- Tests: `pnpm --filter suck-tournament-api test` (pure ladder/seed logic; no DB needed)
- Smoke test: `node scripts/test-api.js`

## Environment

- `DATABASE_URL` (required) - PostgreSQL connection string; migrations run on startup.
- `PORT` (optional) - defaults to `3100`.
- `STATIC_DIR` (optional) - serve a built frontend `index.html` fallback from this directory.
- `ADMIN_TOKEN` (optional) - enables admin-only destructive endpoints. Requests must send the same value in the `x-admin-token` header. Empty means admin access is disabled (503).
- `ES_ENABLED` / `ES_URL` / `ES_USERNAME` / `ES_PASSWORD` / `ES_API_KEY` / `ES_INDEX` (optional) - ship API request and audit logs to Elasticsearch. Defaults to `true` and `http://127.0.0.1:9200`, index prefix `suck-api-logs`.

## Admin access

Administrative operations require `x-admin-token`. In the web app, click the shield icon in the header and enter the token; it is kept in `sessionStorage` for the tab.

Admin-only endpoints include:

- Tournaments: create, edit, delete, status changes, seeds (manual/auto/randomize), bracket generation, overlay state, active match, tournament-scoped account links, and import.
- Matches: manual match creation, score edits, rollback, and replay batch import/reparse/delete.
- Players: rename, merge, delete, and cleanup of empty accounts.
- Votes: deleting past vote options.

Self-service endpoints use `requireSelfOrAdmin` and accept either an admin token or a matching `x-player-id` header:

- `POST /players`, `POST /players/:id/touch`, `POST|DELETE /players/:id/accounts`
- `POST|DELETE /tournaments/:id/register`
- `POST|DELETE /tournaments/:id/vote`, `POST|DELETE /tournaments/:id/custom-vote`

Match result reporting (`POST /tournaments/:id/matches/:matchId/result` and `/walkover`) uses `requireMatchPlayerOrAdmin`: only the two players in that match or an admin may submit it.

Admin checks fail closed: if `ADMIN_TOKEN` is missing, protected endpoints return `503` instead of allowing anonymous access. Self-service checks return `403` when the caller's `x-player-id` does not match the target.

## Elasticsearch logs

Request logs and admin audit events are buffered in memory and sent with the `_bulk` API, so an unavailable ES node never blocks API responses. Logs are dropped after a failed flush (a warning is printed at most once per minute).

- Index: `ES_INDEX-YYYY.MM.DD` (UTC), or `ES_INDEX` when `ES_INDEX_DAILY=false`.
- Request docs: `event=request` with method, path, status, duration, IP, user agent, the decoded `x-player-id` / `x-qq-group` headers, and an `admin` boolean.
- Audit docs: `event=audit` with `action=admin.authorized|admin.denied|admin.not_configured|auth.self|auth.match_player|auth.denied`.
- Bodies and all headers (including the admin token) are never sent to ES.

Quick check after starting the API:

```bash
curl "http://127.0.0.1:9200/suck-api-logs-$(date -u +%Y.%m.%d)/_search?size=1&sort=@timestamp:desc"
```

## Architecture

`Route -> Repository(dir) -> fastify.db.query`. See [AGENTS.md](./AGENTS.md) for the hard rules, database conventions, verification commands, and the app-level Definition of Done.
