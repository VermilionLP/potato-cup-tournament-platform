# suck-tournament — Agent Guide

## Overview

Single-elimination tournament manager replacing Challonge for S.U.C.K (StarCraft Ultra Chicken King) amateur SC2 tournaments. Features: registration, seeding, bracket generation, time voting (multi-select), result submission.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | **Fastify 5** (ESM) on port 3100 |
| Database | **SQLite** via better-sqlite3, stored in `api/data/` |
| Frontend | **SvelteKit 2** SPA (`ssr=false`) on port 5175 |
| Auth | None — players identified by self-chosen ID in localStorage |
| UI | **shadcn-svelte** (nova style) + **Tailwind CSS v4** |

## Architecture

```
suck-tournament/
├── api/                    # Fastify backend
│   ├── app.js              # Entry: registers plugins + routes
│   ├── plugins/database.js # SQLite init + schema migration
│   ├── routes/             # Route handlers (no fp wrapper)
│   │   ├── tournaments.js  # CRUD, seeds, bracket generation
│   │   ├── players.js      # Player upsert, registration
│   │   ├── matches.js      # Result submission, walkover, manual match create
│   │   └── votes.js        # Time voting (multi-select)
│   ├── repositories/       # Data access layer (synchronous, no fp wrapper)
│   │   ├── tournament-repo.js
│   │   ├── player-repo.js
│   │   ├── match-repo.js   # Bracket gen algorithm
│   │   └── vote-repo.js
│   ├── db/schema.sql       # CREATE TABLE (IF NOT EXISTS, re-runnable)
│   ├── data/               # SQLite DB files (gitignored)
│   └── package.json        # ESM, "type": "module"
├── web/                    # SvelteKit frontend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +layout.svelte   # Header + player ID in top bar
│   │   │   ├── +layout.js       # ssr=false, prerender=false
│   │   │   ├── +page.svelte     # Tournament list + create
│   │   │   └── tournament/[id]/+page.svelte  # Detail page
│   │   └── lib/
│   │       ├── api.js           # Fetch wrapper, all API methods
│   │       └── components/ui/   # shadcn-svelte components
│   ├── svelte.config.js
│   ├── vite.config.js           # Proxies /api -> localhost:3100
│   └── package.json
└── AGENTS.md
```

## Key Conventions

### Backend
- **ESM only** (`import`/`export`, `"type": "module"` in package.json)
- Routes are plain async functions (NO `fastify-plugin` wrapper)
- Repositories are plain function factories (NO `fastify-plugin` wrapper)
- Access DB via `fastify.db` (decorated by `plugins/database.js` with `fp()`)
- Error handling: `throw fastify.httpErrors.badRequest(msg)` / `.notFound(msg)` (requires `@fastify/sensible`)
- All DB calls are **synchronous** (better-sqlite3)
- Response: return data directly (Fastify serializes), or throw httpErrors

### Frontend
- **Svelte 5 runes**: `$state`, `$derived`, `$effect`, `$props` (no legacy `$:` or `export let`)
- **SPA mode**: `ssr=false`, `prerender=false`, fallback `index.html`
- API calls go through `$lib/api.js` which uses `fetch` with `/api` prefix
- Dev server proxies `/api` to `http://127.0.0.1:3100`
- Player ID stored in `localStorage` key `suck_player_id`

### Database
- SQLite via better-sqlite3 (synchronous)
- Schema file `api/db/schema.sql` is re-runnable (`IF NOT EXISTS`)
- On server start, `database.js` reads and executes schema.sql
- To reset: delete `api/data/suck-tournament.db` and restart

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/tournaments` | List all tournaments |
| POST | `/api/tournaments` | Create tournament `{id, name, description?, player_capacity?, hold_third_place?}` |
| GET | `/api/tournaments/:id` | Tournament detail (includes players, matches, votes) |
| POST | `/api/tournaments/:id/status` | Change status `{status}` (registration/voting/in_progress/completed) |
| POST | `/api/tournaments/:id/seeds` | Set seeding order `{player_ids: [id1, id2, ...]}` |
| POST | `/api/tournaments/:id/bracket` | Generate single-elimination bracket from seeds |
| GET | `/api/tournaments/:id/bracket` | Get bracket matches |
| POST | `/api/tournaments/:id/register` | Register player `{player_id}` |
| DELETE | `/api/tournaments/:id/register` | Unregister player `{player_id}` |
| POST | `/api/tournaments/:id/matches/:matchId/result` | Submit result `{score1, score2}` |
| POST | `/api/tournaments/:id/matches/:matchId/walkover` | Walkover `{winner_id}` |
| POST | `/api/tournaments/:id/matches/manual` | Manual match create `{round, position, player1_id?, player2_id?}` |
| DELETE | `/api/tournaments/:id/matches` | Clear all matches |
| GET | `/api/tournaments/:id/votes` | Get all votes |
| POST | `/api/tournaments/:id/vote` | Vote for a time `{player_id, proposed_time}` |
| DELETE | `/api/tournaments/:id/vote` | Remove vote `{player_id, proposed_time?}` |

## Database Schema

5 tables: `tournaments`, `players`, `tournament_players`, `matches`, `time_votes`

Key notes:
- `matches.winner_id` set automatically on result submission
- `time_votes` has `UNIQUE(tournament_id, player_id, proposed_time)` — multi-select allowed
- Tournament status flow: registration → voting → in_progress → completed

## Bracket Generation Algorithm

- Uses standard single-elimination seeding order: `getSeedingOrder(size)` (recursive)
- Byes go to top seeds (players without opponents in round 1)
- Pre-generates ALL rounds at once (empty slots for TBD)
- On result submission, `advanceWinner()` fills the next round slot
- Located in `api/repositories/match-repo.js`

## Running

```bash
# Backend (port 3100)
cd suck-tournament/api && pnpm dev

# Frontend (port 5175, proxies /api to 3100)
cd suck-tournament/web && pnpm dev

# Swagger docs at http://localhost:3100/docs
```

## Known Issues

- Tournament IDs with `#` need URL encoding on the client side
- shadcn-svelte v1.3 generates `utils.js.js` import paths (double `.js`), fix manually after `add`
- Tailwind v4 CSS variables for shadcn theme are not defined (components may look unstyled without custom CSS)
