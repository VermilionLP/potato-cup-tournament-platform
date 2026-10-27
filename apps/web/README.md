# suck-tournament-web

Potato Cup (WarThunder) tournament web app: a SvelteKit SPA (SSR disabled, static adapter) built with Svelte 5, Tailwind CSS v4, and shadcn-svelte. It talks to `suck-tournament-api`.

This app lives in the `suck-utilities` repository; see the root `README.md`.

## Commands

Run from the repository root with pnpm:

- Dev server, web + API (`http://localhost:5175`, `/api` proxied to `:3100`): `pnpm dev:suck`
- Build: `pnpm --filter suck-tournament-web build`
- Tests: `pnpm --filter suck-tournament-web test` (bracket/round helpers)

## Notes

- Player identity, QQ group and device keys are stored in `localStorage` and sent to the API as `x-player-id` / `x-qq-group` / `x-player-key` headers.
- Stream mode ("我要直播") is a per-browser toggle persisted in `suck_stream_mode` localStorage, so it never affects other viewers. While enabled and the tournament is `in_progress` with no pending active match, the tournament console shows a blocking modal to pick the next match. After picking, the overlay stays on the `hybrid` scene and a 60s countdown (extendable by +30s) switches it to `ingame`; turning stream mode on first shows a pre-flight checklist (mic, voice, game audio, game capture, overlay).
- See [AGENTS.md](./AGENTS.md) for the hard rules, Svelte 5 patterns, verification commands, and the app-level Definition of Done.
