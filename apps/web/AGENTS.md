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
- The event page (`routes/tournament/[id]/+page.svelte`) wires the event's data to its sections and actions; the data (loading, SSE live updates, the Ban / Pick template, admins' template list and player list, play times, seed order) is `$lib/event-data.svelte.js` (`new EventData(() => tid, () => isAdmin)` during init), and the tabs are `EventTabBar`, `EventOverviewTab` (registration / voting / results / running), `EventBracketCard`, `EventPoolTab`, `RosterCard` and `EventLiveTab`. Actions: reporting a match (Ban / Pick, score, walkover, correction, rollback) is `components/tournament/MatchReport.svelte`, registration and seeding actions are `$lib/event-registration.js`, status / playoff / Swiss-round / live-match / JSON actions are `$lib/event-stage.js`, and the time dialogs (`TimeEditDialog`, `FinalTimeDialog`) carry their own save flows; what it shows is derived in `$lib/event-view.js` (stage matches, labels, bracket sections, placements, result checks), and its sections and dialogs live in `src/lib/components/tournament/` (header, stage controls, registration, seeding, voting, bracket card, results, OBS control, going-live hand-off, dialogs). Vote maths is in `$lib/votes.js`. The "我的比赛" card at the top (`MyMatchCard.svelte`, logic in `$lib/my-match.js`) shows the signed-in player's check-in or next match with the opponent's contact and the report / confirm / dispute buttons; pending reports show in the result dialog (`PendingReportPanel.svelte`) and as a badge on match cards; under the score form `LadderPreview.svelte` shows both players' ladder MMR in the event's division now and after a win or a loss (`$lib/ladder-sim.js`, the server's Elo rule from `apps/api/lib/ladder.js`, kept equal by `test/ladder-sim.test.js`); starting an event with check-in goes through `StartCheckinDialog.svelte`. Below the my-match card the page has tabs (概览 / 对阵 / 选手 / 直播, kept in the address hash; a running event opens on 对阵); the overview holds the stage's panel (registration, voting, results, or `LiveNow.svelte` while running). On phones elimination brackets open as a per-round list (`BracketRoundList.svelte`, `$lib/round-list.js`: rounds in playing order, double elimination interleaved, opening on the round being played) with a switch to the full bracket. "分享到 Discord" (`ShareDialog.svelte`, `$lib/discord-share.js`) builds a ready-to-paste post (announcement or results, Chinese or English) with Discord timestamps `<t:unix:F>` from the Beijing-time schedule, split under 2000 characters; it does not list the vehicle pool (the mode · type line stands for it), the sign-up count or the points line, but does list prizes; the title has no emoji. When the event has a Ban / Pick template, a 载具池 tab shows it (`VehiclePoolView.svelte`): one row per group with the nation flag and vehicle cards with War Thunder Wiki slot images. Unit IDs come from `static/wt-units.json` (names → datamine unit IDs, rebuilt with `tools/wt-units/build-index.mjs` from the War-Thunder-Datamine `units.csv`) via `$lib/wt-units.js`, or a vehicle's own `wiki` field (Wiki ID column in the pool editor); images load through the API's `/vehicle-images` cache with the wiki URL as fallback. Prizes (金鹰币) live in the points table rows next to the points (`PointsEditor.svelte`, `$lib/points.js` `prizeRows` / `prizeTotal` / `placeName`) and show as a header chip and `PrizeCard.svelte` on the overview. Live (SSE) messages on the event page and the overlay go through `$lib/coalesced-refresh.js`, so a burst of updates is one reload. To keep the page light, admin-only parts (seeding, time / player / check-in dialogs, wiki export, `LiveHandoff`) load only for admins, and `VoteProposals` (the calendar), `VehiclePoolView` and `ShareDialog` load when shown (`$lib/lazy.js`); the full player list (`/players`, for batch registration) is fetched only for admins, in parallel with the event; the Ban / Pick template comes from `GET /tournaments/:id/vehicle-pool` (resolved on the server, wiki units filled in), and only admins load every template, for the template picker at the top of the 载具池 tab (`PoolTemplatePicker.svelte`; the header shows no template name). IP addresses on the player list show for admins only.
- Don't use `window.confirm()` / `prompt()` (browsers can block them silently): use `askConfirm(message, { danger, confirmText })` / `askText(message, value)` from `$lib/confirm.svelte.js`, shown by `components/layout/ConfirmHost.svelte` in the root layout.
- Navigation (`components/layout/SiteNav.svelte`) sits in the header on wide screens and as a bottom tab bar on phones (`placement="bottom"`, rendered outside the header because the header's backdrop blur would anchor `fixed` to it); `main` leaves room for it. Pages must fit a 390px-wide phone without sideways scrolling (checked by `e2e/`).
- Every page sets its own `<title>` (`<svelte:head>`); icons are generated from `static/Potato_Cup_2026_icon_*.png` (header `logo-light-64.png` / `logo-dark-64.png`, `favicon-96x96.png`, `favicon.ico`, `apple-touch-icon.png`, `web-app-manifest-*.png`).
- Uncaught errors and unhandled rejections in the browser are sent to the API by `$lib/error-report.js` (installed in `+layout.svelte`; at most 5 per page, noise and extensions skipped); admins read them on `/errors` (link in the nav for admins).
- The event header (`EventHeader.svelte`) shows the sign-up button by the title while sign-ups are open, the tags in two groups (settings: tier, mode, type, format in grey; rewards: points and prizes), and the time card with the check-in opening time; the countdown shows days / hours / minutes and seconds only in the last hour (`countdown` in `$lib/datetime.js`).
- Browser tests of the main flows are in the repo's `e2e/` (Playwright + `node:test`, run by CI against a real server).
- The English dictionary (`$lib/i18n/translate.js` + `en.js`) is loaded only when English is chosen (`loadTranslator()` in `$lib/i18n/locale.svelte.js`); don't import `translate.js` statically from app code, or every visitor downloads it again. `$lib/discord-share.js` gets the translator through `useTranslator()`.
- The player page `routes/player/[id]` combines `/players/:id`, `/players/statistics`, `/ladder/players/:id` and `/points-leaderboard` (maths in `$lib/player-profile.js`); player names in rosters, the player list, stats and ladder link to it.
- The statistics page's parts are in `components/stats/` (helpers in `$lib/stats-view.js`), the ladder's in `components/ladder/`, the vehicle pool template page's in `components/pools/` (draft / save helpers in `$lib/pool-editor.js`), the points leaderboard's in `components/points/` (`PointsBoard`, and `SeasonAdmin` loaded for admins only); the player profile dialog's admin part (device key, merge) is `components/players/PlayerAdminTools.svelte`, loaded for admins only; files are saved with `$lib/download.js`; the event header's editable tags are `components/tournament/EventTagControls.svelte`, and match card buttons `MatchCardActions.svelte`. The bracket views (`SingleElimBracket`, `DoubleElimBracket`, `SwissView`, the phone `BracketRoundList`; group brackets reuse `DoubleElimBracket`) draw every match with `components/BracketMatchCard.svelte` (header with `MatchCardActions`, flag, name, crown, score; opens the result dialog when playable or correctable), so all formats look alike; card helpers are in `$lib/match-card.js` (score cell, playable, bye, mine) and layout maths in `$lib/bracket.js` (`treePositions` also drives the overlay's tree; `withGrandFinalColumn`, `columnConnectors`, `numberMatches` for double elimination).
- Other pages follow the same split: the OBS overlay's scenes are in `components/overlay/` (layout maths in `$lib/overlay-layout.js`); every bracket and board there draws its matches with `OverlayMatchCard.svelte` (sizes sm / md / lg: VS line, bold white names, scores in cyan boxes, loser dimmed), so all formats look alike, the site header and its dialogs in `components/layout/`, the lobby's rows and create-event wizard in `components/lobby/` (`$lib/lobby.js`, `$lib/create-event.js`), the player list in `components/players/`. Pure helpers in `src/lib/*.js` get tests in `test/`.
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
