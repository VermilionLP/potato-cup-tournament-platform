# suck-tournament-api

Potato Cup (WarThunder) tournament API: Fastify 5 on PostgreSQL (schema `axsuck`), with Postgrator migrations, SSE live updates, and Swagger docs.

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

- Tournaments: create, edit, delete, status changes, seeds (manual/auto/randomize), bracket generation, overlay state, active match, and import.
- Matches: manual match creation, score edits, and rollback.
- Players: rename, merge, delete, and device-key reset.
- Votes: deleting past vote options.

Self-service endpoints use `requireSelfOrAdmin` and accept either an admin token or a matching `x-player-id` header:

- `POST /players`, `POST /players/:id/touch`
- `POST|DELETE /tournaments/:id/register`
- `POST|DELETE /tournaments/:id/vote`, `POST|DELETE /tournaments/:id/custom-vote`

Match result reporting (`POST /tournaments/:id/matches/:matchId/result` and `/walkover`) uses `requireMatchPlayerOrAdmin`: only the two players in that match or an admin may submit it.

Admin checks fail closed: if `ADMIN_TOKEN` is missing, protected endpoints return `503` instead of allowing anonymous access. Self-service checks return `403` when the caller's `x-player-id` does not match the target.

Device keys (`lib/player-key.js`): the first device that uses a player ID binds a random key to it (`POST /players/:id/key`, stored as a SHA-256 hash in `player_keys`). From then on, self-service and match-result requests for that ID also need the key in `x-player-key`, else `403` with code `PLAYER_KEY_REQUIRED`. Players copy the key to another device from their profile; admins can see and reset the binding (`GET|DELETE /players/:id/key`).

Write requests (not admin) are rate-limited per IP in memory (`lib/rate-limit.js`): 60 per minute, 10 per minute for key binding; over that the API answers `429` with `Retry-After`. `X-Forwarded-For` is trusted only from a local proxy unless `TRUST_PROXY` is set. Request bodies are capped at 5 MB.

## Importing past events from Liquipedia

`scripts/import-liquipedia.js` imports the finished Potato Cup events
(`Potato Cup/...` and `Potato Cup Weekly/...`) from the War Thunder
Liquipedia wiki through the MediaWiki API, following its terms of use
(identifying User-Agent, gzip, one request every 2 s). The download is
cached in `.cache/liquipedia/potato-cup.json`.

```bash
node scripts/import-liquipedia.js            # dry run: events, skipped pages, data warnings, look-alike names
node scripts/import-liquipedia.js --apply    # write; re-running replaces the imported events (ids lp-...)
node scripts/import-liquipedia.js --refresh  # download again instead of using the cache
```

Set `LIQUIPEDIA_CONTACT` (e.g. an e-mail) so Liquipedia can reach you about
the requests. Names that only differ in letter case, spaces, underscores,
dashes, dots or look-alike Cyrillic letters are merged into one player (an
existing platform id wins, otherwise the most used spelling). Imported
events are `completed`, carry `played_at`/`source_url`, and link back to
their Liquipedia page (CC-BY-SA 3.0). The ladder rates all games in date
order; `GET /api/ladder?window=year` rates only the last 365 days.

`scripts/import-liquipedia-flags.js` fills in player nationality: the
player's Liquipedia page (Infobox country) first, otherwise the most recent
Potato Cup page that shows a flag for them (participant tables, match
opponents). Dry run by default, `--apply` writes. Players without a flag and
players that only appear in imported events are updated; a different flag on
a player who uses the platform is only listed unless `--overwrite` is given.

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
