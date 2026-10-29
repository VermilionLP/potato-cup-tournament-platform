# AI Guide: suck-tournament-web

## Role

`apps/web` is the Potato Cup (WarThunder) tournament web app: a SvelteKit SPA (SSR disabled, static adapter) using Svelte 5 runes, Tailwind CSS v4, shadcn-svelte, and `$lib/api.js` to talk to `suck-tournament-api`.

Read this guide before editing files under `apps/web`.

## Hard Rules

- Use Svelte 5 runes for new code; the Svelte compiler runs with `runes: true`.
- Do not introduce `export let`, `$:` reactive labels, or Svelte 4 store patterns in new components.
- Keep `export const ssr = false` and `export const prerender = false` in `src/routes/+layout.js`; this is a client-only SPA.
- Call the backend through the `API` object in `$lib/api.js`. Do not call `fetch` directly from pages or components.
- Client identity is `localStorage`-backed and injected as headers by `$lib/api.js`: `x-player-id`, `x-qq-group` and the device key `x-player-key` (`$lib/player-key.js`). Keep that behavior aligned with `$lib/user.svelte.js`.
- The admin token is `sessionStorage`-backed and injected as `x-admin-token` by `$lib/api.js`; never move it to `localStorage` or a URL.
- Use shadcn-svelte primitives from `$lib/components/ui`; install new ones only when needed.
- Use `@lucide/svelte` for icons.
- Do not add another UI framework.

## Project Shape

- Routes live in `src/routes` (`+page.svelte`, `tournament/[id]/`, `tournament/[id]/overlay/`, `players/`, `stats/`, `ladder/`).
- Shared utilities live in `src/lib` (`api.js`, `utils.js`).
- App state uses a class with `$state`, e.g. `src/lib/user.svelte.js`.
- UI primitives live in `src/lib/components/ui`.
- The event page (`routes/tournament/[id]/+page.svelte`) keeps state and loading and wires the actions: reporting a match (Ban / Pick, score, walkover, correction, rollback) is `components/tournament/MatchReport.svelte`, registration and seeding actions are `$lib/event-registration.js`, status / playoff / Swiss-round / live-match / JSON actions are `$lib/event-stage.js`, and the time dialogs (`TimeEditDialog`, `FinalTimeDialog`) carry their own save flows; what it shows is derived in `$lib/event-view.js` (stage matches, labels, bracket sections, placements, result checks), and its sections and dialogs live in `src/lib/components/tournament/` (header, stage controls, registration, seeding, voting, bracket card, results, OBS control, going-live hand-off, dialogs). Vote maths is in `$lib/votes.js`. Live (SSE) messages on the event page and the overlay go through `$lib/coalesced-refresh.js`, so a burst of updates is one reload.
- The statistics page's parts are in `components/stats/` (helpers in `$lib/stats-view.js`), the ladder's in `components/ladder/`, the vehicle pool template page's in `components/pools/`; the event header's editable tags are `components/tournament/EventTagControls.svelte`, and match card buttons `MatchCardActions.svelte`. The bracket views (`SingleElimBracket`, `DoubleElimBracket`, `SwissView`) share card helpers in `$lib/match-card.js` (score cell, playable, bye, mine) and layout maths in `$lib/bracket.js` (`treePositions` also drives the overlay's tree; `withGrandFinalColumn`, `columnConnectors`, `numberMatches` for double elimination).
- Other pages follow the same split: the OBS overlay's scenes are in `components/overlay/` (layout maths in `$lib/overlay-layout.js`), the site header and its dialogs in `components/layout/`, the lobby's rows and create-event wizard in `components/lobby/` (`$lib/lobby.js`, `$lib/create-event.js`), the player list in `components/players/`. Pure helpers in `src/lib/*.js` get tests in `test/`.
- The dev server runs on port 5175 and proxies `/api` to `http://127.0.0.1:3100`.

## Verification Commands

- Lint/typecheck: none defined; the build below is the closest check.
- Tests: `pnpm --filter suck-tournament-web test` (`node --test`; pure helpers such as bracket/round labels).
- Build: `pnpm --filter suck-tournament-web build`
- Compile check without npm (sandboxes that only reach GitHub): `bash scripts/svelte-check-offline.sh [file...]` compiles every `.svelte` / `.svelte.js` file with the locked Svelte version; it reports compile errors and identifiers that are used but never defined (e.g. after moving code into a component); no a11y warnings, no type check.
- Dev server: `pnpm dev:suck` (port 5175; proxies `/api` to `http://127.0.0.1:3100`)
- UI flow: verify routes with the Playwright CLI and skill when UI behavior changes.

## Definition of Done

This app's work is done only when:

- `pnpm --filter suck-tournament-web test` and `pnpm --filter suck-tournament-web build` pass.
- UI changes were verified with the dev server and Playwright.
- The change matches the Hard Rules above.
