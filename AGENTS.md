# suck-utilities — Agent Guide

## Overview

S.U.C.K SC2 水友赛工具集。单淘赛事的报名、种子、对阵、投票、比分、OBS overlay，以及 SC2 录像解析与 Liquipedia wiki 生成。

## Layout

```
apps/
├── api/              # Fastify 5 (ESM), port 3100, PostgreSQL schema axsuck
└── web/              # SvelteKit 2 SPA (ssr=false), port 5175
```

录像解析由 `apps/api/scripts/parse_replay.py` 调用服务器上的 Python（`sc2reader` / `spawningtool`）。

## Stack

| Layer | Technology |
|-------|-----------|
| API | Fastify 5, `@fastify/postgres`, Postgrator migrations, SSE, Swagger |
| Database | PostgreSQL，所有表在 `axsuck` schema |
| Web | Svelte 5 runes, SvelteKit 2 + adapter-static, Tailwind CSS v4, shadcn-svelte |

## Commands

```bash
pnpm install
pnpm dev          # api + web
pnpm migrate      # 运行 PostgreSQL 迁移
pnpm build:web    # 生成 apps/web/build
pnpm test         # web + api 单元测试（不需要数据库）
```

## Hard Rules

- ESM only（`import`/`export`）。
- SQL 只能用参数化查询；表名一律限定为 `axsuck.<table>`。
- Route 是普通 async 函数，不要用 `fastify-plugin` 包裹。
- 数据库通过 `fastify.db.query(...)` 访问。
- API 响应保持 `{ data, meta }` 形状（已有例外除外）。
- 前端只用 Svelte 5 runes（`$state` / `$derived` / `$effect` / `$props`），不要用 `$:` 或 `export let`。
- API 请求统一走 `$lib/api.js`；开发时 `/api` 由 Vite 代理到 `:3100`。
- 凭证只从环境变量读取，绝不提交到仓库；`apps/*/.env` 已被 gitignore。

## Credentials

- `apps/api/.env` — `DATABASE_URL`、`PORT`、`ALLOWED_QQ_GROUPS`、VAPID keys

## History

2026-10 重写过公开历史，移除了真实录像、玩家 Battle.net 数据和旧凭证。见 `HISTORY.md`。
