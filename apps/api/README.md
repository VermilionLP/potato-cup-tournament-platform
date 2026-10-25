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

## Architecture

`Route -> Repository(dir) -> fastify.db.query`. See [AGENTS.md](./AGENTS.md) for the hard rules, database conventions, verification commands, and the app-level Definition of Done.
