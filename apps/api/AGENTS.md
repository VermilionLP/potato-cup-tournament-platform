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
- Results: admins' take effect at once; players' become `matches.pending_report` and wait for the opponent or an admin (`lib/match-reports.js` rules, `lib/match-flow.js` applying them, forfeits and "your match is ready" pushes, `lib/report-scheduler.js` auto-confirming after 10 minutes). After any result call `afterResult(fastify, tournamentId)`.
- Player routes: `players.js` (profiles, rename, merge, delete), `player-keys.js`, `registrations.js`, `player-stats.js` (statistics computed by `lib/player-statistics.js`).
- Ladder ratings and the statistics page data are cached in memory (`lib/ladder-cache.js`, per division / scope, 5 min TTL). Any successful non-GET request drops the cache (hook in `app.js`), except the writes in `CACHE_NEUTRAL_ROUTES` (touch and push re-subscribe on every page load, votes, check-in, live state, report disputes) — add a route there when it can never move ratings. Two seconds after the last cache-dropping write, `warmLadder` refills the keys used in the last 15 minutes in the background; code that changes matches, players or events outside a request (scripts, timers) must call `invalidateLadder(db)` or wait for the TTL. Don't mutate what `getRatings` returns from the cache (`history`, `games`).
- Responses: `lib/compression.js` (an `onSend` hook) compresses /api text and JSON over 1 KB with Brotli (quality 4) or gzip, by `Accept-Encoding`; streams (SSE, static files, which are pre-compressed) and images pass through.
- Privacy: `GET /players` and `GET /players/:id` leave out `last_ip` unless the request is an admin's (`lib/player-privacy.js`); keep admin-only columns there when adding fields to player rows.
- CORS: no other origin may call the API from a browser unless listed in `CORS_ORIGINS` (`lib/cors.js`; `*` = any). The web app, overlay and Vite dev proxy are same-origin.
- Event vehicle pool: `GET /tournaments/:id/vehicle-pool` returns the template the event uses (`resolveTemplate`) with each vehicle's wiki `unit` filled in from `apps/web/static/wt-units.json` using the web app's `$lib/wt-units.js` (`lib/wt-unit-index.js`), so event pages don't load every template or the name index.
- Results: a score or walkover and the bracket advancement are written in one transaction (`recordScore` / `recordWalkover` / `applyReport` in `lib/match-flow.js`), so a match is never left completed without its winner moved on. `inTransaction` (`lib/transaction.js`) joins an outer transaction when given a client already in one (e.g. a result that creates the next Swiss round).
- Link previews: the SPA fallback in `app.js` serves `/tournament/:id` with the event's `<title>` and Open Graph tags (`lib/page-meta.js`), so links pasted in Discord / QQ show the event; other pages get the plain `index.html`.
- Ladder limit (migration 038, `lib/ladder-limit.js`): an event may cap self sign-ups at a ladder MMR (`ladder_max_mmr`) or a league (`ladder_max_tier`, e.g. `gold` = gold and below), at most one, set on create or with `PATCH /tournaments/:id`. It uses the player's row in the event's own division (`LadderRepo.limitStanding`: game mode + event type, as the ladder page shows it); unrated and provisional players (under 10 games there) are refused with 403. Admin registrations are not limited; players already registered stay when the limit changes. `GET /tournaments/:id/ladder-eligibility?player_id=` tells the page before the player tries.
- Live scores (migration 042): `POST /tournaments/:id/matches/:matchId/live-score {score1, score2}` (admins and the two players; ties allowed; nulls clear) stores `matches.live_score1/2` and `live_score_at` on a pending match with both players: no winner, no advancement, no ladder effect. A trigger clears them whenever the match's status or players change (result, walkover, rollback). SSE type `match_live_score`.
- Live deltas: `GET /tournaments/:id` returns `synced_at` (database clock at the start of the read); `GET /tournaments/:id/live?since=` returns the event without players / votes, the matches changed since then (15 s margin, `lib/live-delta.js`) and every match id in order. `matches.updated_at` is kept by a trigger (migration 041), so writes need no change.
- Admins: `GET /players/duplicates` lists likely duplicate players (`duplicatePairs` in `lib/player-lookup.js`: the smaller record suggested into the bigger), `POST /players/not-duplicates {a, b}` hides a pair (`axsuck.player_not_duplicates`, migration 040). The player index behind the lookup and the finder is cached with the ladder (`cached(db, 'player-lookup')`); lookups are rate limited (60 / minute per IP, `lib/rate-limit.js` rules marked `reads`).
- `GET /players/lookup?name=` (public, sign-in help): `{ exact, alias, similar }` from `lib/player-lookup.js` (names compared without case and separators, small typos by length, old IDs from `player_aliases`), each with `events`, `last_event`, `key_bound`; no contact data.
- Front-end errors: browsers `POST /client-errors` (public, rate limited; `lib/client-errors.js` cleans and fingerprints them; one row per error with a count in `axsuck.client_errors`, migration 037, newest 500 kept); admins `GET` / `DELETE /client-errors` (the web app's `/errors` page).
- `BACKGROUND_JOBS=off` starts the server without the push reminder and report auto-confirm timers: used for the deploy's try-out copy on port 3101 and in CI.
- Vehicle images: `GET /vehicle-images/:kind/:file` (`routes/vehicle-images.js`, `lib/vehicle-images.js`) serves War Thunder Wiki slot images and nation flags from a disk cache (`VEHICLE_IMAGE_CACHE`, default `apps/api/.cache/vehicle-images`), fetching misses from `static.encyclopedia.warthunder.com` once (misses remembered for an hour). Pool vehicles may carry `wiki` (the wiki unit ID) to pick the image.
- QQ bots (migration 047, `apps/bot`): the bot routes (`routes/bot.js`) need `BOT_TOKEN` in the `x-bot-token` header (`lib/bot-auth.js`; an admin token works too; a bot token is not an admin token; without `BOT_TOKEN` they answer 503 and nothing is queued; bot requests skip the rate limit). The notices that already go out as web push (ready, score to confirm, ban turn in `lib/match-flow.js`) also queue a row in `axsuck.bot_notices` (`lib/bot-notices.js`: text + the QQ numbers to @ from the players' contacts), plus results (`notifyResults`, run by `afterResult`, once per outcome) and the hour-before reminder (`lib/bot-scheduler.js`); the community bot polls `GET /bot/notices` (unsent, at most 30 minutes old) and calls `POST /bot/notices/:id/sent`. Notice and bot reply texts live only in `lib/bot-notices.js` (Chinese only; skipped by the web app's i18n coverage test). Binding: a player gets a 6-digit code (`POST /players/:id/qq-bind-code`, 10 minutes) and sends it to the official bot, which calls `POST /bot/bind {code, openid}`; `axsuck.qq_bindings` maps the openid QQ gives the bot to the player (moved on rename / merge); `GET /bot/whois/:openid` and `GET /bot/players/:id/schedule` answer the bot's queries. Registration from QQ: `GET /bot/open-events?openid=`, `POST /bot/register`, `/bot/unregister`, `/bot/checkin` (`{openid, tournament_id}`) act only for the player bound to that openid (403 `NOT_BOUND` otherwise); the rules are shared with the site's routes in `lib/registration.js` (`registerPlayer`, `unregisterPlayer`, `setCheckin`), so both refuse the same things. Creating an event in registration queues a "sign-ups open" notice (`queueRegistrationOpen`).
- Prizes: rows of an event's `points_table` may carry `prize` (Golden Eagles, integer), checked in `lib/points.js` next to the points.
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
