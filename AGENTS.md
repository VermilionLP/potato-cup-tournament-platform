# Potato Cup 赛事平台 — Agent Guide

## Overview

WarThunder Potato Cup 水友赛平台：报名、时间投票、种子、对阵（单败 / 双败 / 瑞士轮 / 小组赛 + 淘汰赛）、Ban/Pick 载具池、比分、OBS overlay、天梯 MMR、年度积分榜、Liquipedia wiki 生成。2022–2026 的历史赛事曾从 Liquipedia 一次性导入（id `lp-...`），导入代码已删除。

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

Ban / Pick 的载具池是 `axsuck.vehicle_pools` 里的模板（迁移 027）：每个模板属于一种比赛类型（`event_type`，仍是固定的 `prop` / `top-jet` / `legacy-jet` / `proleague`；`top-jet` 顶级喷气是 Weekly #23（2026-05-30）之前的喷气赛事，迁移 030 按日期划分，积分榜计入早期喷气的榜单），可限定游戏模式（`game_modes`，空 = 全部），并带自己的 BP 规则（`rules`：`bansPerPlayer`、`groupRerolls`、`vehicleRerolls`、`drawVehicle`）。比赛的 `tournaments.vehicle_template` 为空时自动匹配：同类型按 `sort_order`，先找包含该模式的，再找全部模式的。匹配逻辑在 `apps/api/lib/vehicle-pools.js` 和 `apps/web/src/lib/vehicle-pools.js` 各有一份，改动要同步。BP 状态只在客户端（`$lib/banpick.js`），不存服务器。

## Live channels

直播状态按「频道」分（`axsuck.live_channels`，迁移 029）：每场赛事最多 9 个频道，每个频道有自己的当前直播对局（`active_match_id`）和大屏场景 / 阶段（`overlay_*`），同一对局同时只能在一个频道直播（唯一索引，冲突返回 409）。控制台在赛事页选频道（按赛事记在浏览器里，`$lib/live-channels.js`），OBS 遮罩用 `/tournament/<id>/overlay?channel=N`，不带参数就是频道 1。`GET /tournaments/:id` 返回 `live_channels`，顶层的 `active_match_id` / `overlay_*` 是频道 1 的值；`tournaments` 表上的同名旧列已在迁移 032 删除；对局被删除时，频道里的直播对局由外键自动清空。前端用 `withChannel(t, n)` 把某个频道的状态放回顶层字段，遮罩和控制台组件因此不用改。

## Event tiers

赛事有等级（`tournaments.tier`：S / A / B / C / D，对应 Liquipedia 的 liquipediatier 1–5）和性质（`event_kind`：season 季度赛 / monthly 月赛 / weekly 周赛 / qualifier 预选赛 / misc 其他），迁移 031 按 Liquipedia 页面回填导入的赛事，其余按积分榜类型（月赛 B、周赛 C）。规则在 `apps/api/lib/event-tier.js`，前端标签在 `$lib/tournament.js`（`EVENT_TIERS` / `EVENT_KINDS`）。管理员在赛事页顶部修改；`GET /players/statistics?tier=&kind=` 只统计该等级 / 性质的赛事，并返回按等级的冠军数（`championships_by_tier`）；预选赛按 `event_kind` 判断，不计冠军。Wiki 导出默认用赛事等级。

## Liquipedia export

赛事页「导出 Wiki」由 `apps/api/lib/liquipedia/export.js` 生成，版式照 Potato Cup 页面：瑞士轮周赛（Potato_Cup_Weekly/12）、双败（Potato_Cup/2026/Aug/Asia_Pacific）、瑞士轮小组 + 双败淘汰（Potato_Cup/2026/June/Europe）、双败小组 + 双败淘汰（Potato_Cup/2026/Fall/Europe，每组晋级 2 人用 `Bracket/8-1Q-U-4L2DSL1D-1Q` 这类模板）。赛制、Bo（按比分推算）、积分（赛事积分表）、参赛者、对阵来自赛事；奖金、直通资格、解说、直播等存在 `tournaments.wiki_meta`（迁移 028，`export-meta.js` 校验），新赛事沿用上一场的解说和直播。双败 4–16 人和每组晋级 2 人的 4–8 人双败小组的模板结构存在 `lib/liquipedia/de-templates.js`（取自 Liquipedia commons 的 TemplateMatch），导出时从决赛倒推、按晋级关系把每场对到模板的 R#M# 上（轮空不占位）；没有存模板的人数按列推算（双败胜者组第 u 轮在第 2u-2 列）并给出提示。

## History

2026-10 重写过公开历史，移除了真实录像、玩家 Battle.net 数据和旧凭证。见 `HISTORY.md`。同月移除了 SC2 录像上传/解析功能（`match_replays` 表已丢弃）。同月把选手资料里的 Battle.net 服务器标签换成 QQ / Discord 联系方式（`battle_tags` 新键 `qq` / `discord`，迁移 008），国籍改用 `apps/web/static/flags/<iso>.svg` 本地国旗，不再依赖 emoji。之后移除了 Battle.net 账号关联（`players.bnet_ids`、`tournament_player_accounts`，迁移 026）和种族字段；`battle_tags` 列名保留，现在只存联系方式。
