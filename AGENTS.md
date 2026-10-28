# Potato Cup 赛事平台 — Agent Guide

## Overview

WarThunder Potato Cup 水友赛平台：报名、时间投票、种子、对阵（单败 / 双败 / 瑞士轮 / 小组赛 + 淘汰赛）、Ban/Pick 载具池、比分、OBS overlay、天梯 MMR、年度积分榜、Liquipedia 导入与 wiki 生成。

前身是星际争霸 2 水友赛工具 S.U.C.K，所以包名（`suck-tournament-*`）、schema `axsuck`、PM2 进程名 `suck-tournament` 和 `suck_*` 存储键沿用旧名；改名会影响部署和已登录用户，不要随手改。天梯段位图标（`static/sc2-icons/league`）是有意保留的。

## Layout

```
apps/
├── api/              # Fastify 5 (ESM), port 3100, PostgreSQL schema axsuck
└── web/              # SvelteKit 2 SPA (ssr=false), port 5175
```

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

- `apps/api/.env` — `DATABASE_URL`、`PORT`、VAPID keys、`ADMIN_TOKEN`、`ES_*`

## Vehicle pool templates

Ban / Pick 的载具池是 `axsuck.vehicle_pools` 里的模板（迁移 027）：每个模板属于一种比赛类型（`event_type`，仍是固定的 `prop` / `legacy-jet` / `proleague`），可限定游戏模式（`game_modes`，空 = 全部），并带自己的 BP 规则（`rules`：`bansPerPlayer`、`groupRerolls`、`vehicleRerolls`、`drawVehicle`）。比赛的 `tournaments.vehicle_template` 为空时自动匹配：同类型按 `sort_order`，先找包含该模式的，再找全部模式的。匹配逻辑在 `apps/api/lib/vehicle-pools.js` 和 `apps/web/src/lib/vehicle-pools.js` 各有一份，改动要同步。BP 状态只在客户端（`$lib/banpick.js`），不存服务器。

## Liquipedia export

赛事页「导出 Wiki」由 `apps/api/lib/liquipedia/export.js` 生成，版式照 Potato Cup 页面：瑞士轮周赛（Potato_Cup_Weekly/12）、双败（Potato_Cup/2026/Aug/Asia_Pacific）、瑞士轮小组 + 双败淘汰（Potato_Cup/2026/June/Europe）。赛制、Bo（按比分推算）、积分（赛事积分表）、参赛者、对阵来自赛事；奖金、直通资格、解说、直播等存在 `tournaments.wiki_meta`（迁移 028，`export-meta.js` 校验），新赛事沿用上一场的解说和直播。对阵 key 按 Liquipedia 模板的列编排（双败胜者组第 u 轮在第 2u-2 列），已知模板会省掉轮空；未知人数用 2 的幂模板并给出提示。

## History

2026-10 重写过公开历史，移除了真实录像、玩家 Battle.net 数据和旧凭证。见 `HISTORY.md`。同月移除了 SC2 录像上传/解析功能（`match_replays` 表已丢弃）。同月把选手资料里的 Battle.net 服务器标签换成 QQ / Discord 联系方式（`battle_tags` 新键 `qq` / `discord`，迁移 008），国籍改用 `apps/web/static/flags/<iso>.svg` 本地国旗，不再依赖 emoji。之后移除了 Battle.net 账号关联（`players.bnet_ids`、`tournament_player_accounts`，迁移 026）和种族字段；`battle_tags` 列名保留，现在只存联系方式。
