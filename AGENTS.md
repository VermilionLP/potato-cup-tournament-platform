# Potato Cup 赛事平台 — Agent Guide

## Overview

WarThunder Potato Cup 水友赛平台：报名、时间投票、种子、对阵（单败 / 双败 / 瑞士轮 / 小组赛 + 淘汰赛）、Ban/Pick 载具池、比分、OBS overlay、天梯 MMR、年度积分榜、Liquipedia wiki 生成。2022–2026 的历史赛事曾从 Liquipedia 一次性导入（id `lp-...`），导入代码已删除。

前身是星际争霸 2 水友赛工具 S.U.C.K，所以包名（`suck-tournament-*`）、schema `axsuck`、PM2 进程名 `suck-tournament` 和 `suck_*` 存储键沿用旧名；改名会影响部署和已登录用户，不要随手改。天梯段位图标（`static/sc2-icons/league`）是有意保留的。

## Layout

```
apps/
├── api/              # Fastify 5 (ESM), port 3100, PostgreSQL schema axsuck
├── bot/              # QQ bots (Koishi): official QQ bot + NapCat community bot, PM2 potato-bot; see apps/bot/README.md
└── web/              # SvelteKit 3 SPA (ssr=false), port 5175
packages/
└── shared/           # @potato-cup/shared: rules both apps apply (Ban / Pick, vehicle pool templates)
```

Code that the server and the website must agree on goes in `packages/shared` (plain ES modules, no dependencies; both apps depend on `"@potato-cup/shared": "workspace:*"` and import `@potato-cup/shared/<file>.js`), not into two copies.

Site sections (main navigation, `SiteNav.svelte`): 赛事大厅 `/` (events, `/tournament/<id>`), 选手 `/players` (finding people; `/player/<id>`), 排行 `/ladder` and `/points` (two tabs, `RankingTabs.svelte`), 数据 `/stats` (players, vehicles, hall of fame). Admin tools are in the header's shield menu (`AdminMenu.svelte`): each running / upcoming event's console `/tournament/<id>/console`, vehicle pool templates `/pools`, error reports `/errors`.

## Stack

| Layer | Technology |
|-------|-----------|
| API | Fastify 5, `@fastify/postgres`, Postgrator migrations, SSE, Swagger |
| Database | PostgreSQL，所有表在 `axsuck` schema |
| Web | Svelte 5 runes, SvelteKit 3 + adapter-static (Vite 8; Node ≥ 22.17), Tailwind CSS v4, shadcn-svelte |

## Checks and deploy

CI（`.github/workflows/ci.yml`）有两个任务：`test`（单元测试 + 前端构建）和 `smoke`（Ubuntu 24.04 + 临时 PostgreSQL：从头跑全部迁移、启动真实服务器、`scripts/smoke.sh` 检查页面 / 静态文件 / API / 文档 / 压缩，再跑 `e2e/` 里的 Playwright 浏览器测试：访客浏览赛事、管理员填报比分、选手报名）。推送 `ci/**` 分支也会跑 CI；`deps/**` 分支由 `lockfile.yml` 在 GitHub 上更新 `pnpm-lock.yaml`（本地连不上 npm 时用）。

数据库每日备份：在服务器上运行一次 `bash /home/admin/suck/scripts/backup-db.sh --install-cron`（每天 04:17，保留 14 份，`--remove-cron` 取消）。

`scripts/deploy.sh` 在构建后先用 `BACKGROUND_JOBS=off PORT=3101` 启动新版本跑 `scripts/smoke.sh`，通过才重启正式进程，重启后再跑一次；构建失败、试运行失败或重启后检查失败都会自动用本次部署前的代码备份回滚（数据库迁移不回滚，脚本会提示 pre-deploy 数据库备份的位置）。

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
- API 请求统一走 `#lib/api.js`；开发时 `/api` 由 Vite 代理到 `:3100`。
- 凭证只从环境变量读取，绝不提交到仓库；`apps/*/.env` 已被 gitignore。

## Credentials

- `apps/api/.env` — `DATABASE_URL`、`PORT`、`ADMIN_TOKEN`、`ES_*`；VAPID keys 可不填（见下面「Reminders」）

选手的 QQ / Discord（`players.battle_tags` 里的 `qq` / `discord`）只发给已登录的选手和管理员（`lib/player-privacy.js` 的 `contactFor` / `canSeeContacts`，用在选手、赛事详情和投票接口）；游客收到的 `battle_tags` 里没有这两项，前端 `ContactBadges` 显示「登录后可见」。

## Site style

全站样式按《Potato Cup 全站外观与组件统一方案》：浅色主题默认（`ModeWatcher defaultMode="light"`），深色保留；页头在两种模式下都是深色条（`header.dark`，白色 POTATO CUP 字标 `static/logo-wordmark-64.webp`）。颜色只用 `src/app.css` 的变量：品牌橙 `primary` #F97316（按钮、选中、进度），浅色背景上的橙色文字用 `text-brand-ink`（不要用 `text-primary`，白底上对比度不够），语义色 `win` / `loss` / `live` / `prize`、A/B 两方 `side-a` 金 / `side-b` 紫。字号只用六档：`text-display` / `text-title` / `text-heading` / `text-body` / `text-small`（12px，中文最小）/ `text-label`（11px，只给大写英文小标签）；表格数字用 `num`（Barlow 等宽数字），标题和大数字用 `font-display`（Barlow Condensed）。中文和正文字体是 HarmonyOS Sans SC：`scripts/fonts.mjs` 在 `pnpm dev` / `pnpm build` 前把按字符拆分的字体从 node_modules 复制到 `static/fonts/`（已 gitignore），`app.html` 非阻塞加载。公共组件：`ui/tag`（胶囊标签，按含义上色，色调表在 `#lib/tags.js`）、`ui/chip`（筛选胶囊）、`ui/empty-state`、`ui/stat-tile`；按钮只有 44px（默认）和 32px（`size="sm"`）两种高度。表单控件按用途只有两种（`src/app.css`）：`.field`（表单、弹窗、筛选栏，32px 高，14px 字，手机 16px 防止 iOS 聚焦放大，不加粗；和 `ui/input` 的 `<Input>` 一样，`<Input>` 不要再加 `text-xs` / `h-8`）和 `.field-compact`（密集表格单元格、OBS 控制台，28px、12px）；表单标签统一 `text-small font-semibold text-muted-foreground`。`cn()` 已教给 tailwind-merge 这六档字号，自定义字号类不会被颜色类吞掉。 页面筛选用 `ui/filter-group`（`FilterBar` + 带小标题的胶囊组 `FilterGroup`），长列表一次显示一页（大厅 8 / 10 场，选手和天梯 30 名）加「再显示 / 全部显示」，颜色要有含义（赛事标记按等级，头像统一灰色）。

## Vehicle pool templates

Ban / Pick 的载具池是 `axsuck.vehicle_pools` 里的模板（迁移 027）：每个模板属于一种比赛类型（`event_type`，仍是固定的 `prop` / `top-jet` / `legacy-jet` / `proleague`；`top-jet` 顶级喷气是 Weekly #23（2026-05-30）之前的喷气赛事，迁移 030 按日期划分，积分榜计入早期喷气的榜单），可限定游戏模式（`game_modes`，空 = 全部），并带自己的 BP 规则（`rules`：`bansPerPlayer`、`groupRerolls`、`vehicleRerolls`、`drawVehicle`）。比赛的 `tournaments.vehicle_template` 为空时自动匹配：同类型按 `sort_order`，先找包含该模式的，再找全部模式的。模板的清理和匹配（`normalizeTemplate`、`resolveTemplate`）在共享包 `packages/shared/vehicle-pools.js`，前后端共用。比赛的 BP 存在服务器（迁移 044 `matches.banpick`：`{ rev, state, log }`，`POST /tournaments/:id/matches/:matchId/banpick {action, group, vehicle, rev}`，规则在共享包 `packages/shared/banpick.js`）：随机抽取由服务器完成；本场两位选手和管理员可以操作，禁用必须轮到自己（管理员可代禁），选手只能撤销自己刚才的禁用，其他撤销和重置只有管理员能做；撤销会标记被撤销的记录并重放，撤销本身也记入操作记录；`rev` 不一致返回 409；对局双方变化时由触发器清空，出结果后保留。服务器和网页用同一套状态转换（`step`；网页的 `#lib/banpick.js` 从共享包转出，只加了操作记录的文字），模板预览页用 `localAct` 在本地试抽（`apps/web/test/banpick-server.test.js` 对照两者结果一致）。BP 对话框顶部是引导栏（`banpick/BanPickGuide.svelte`）：步骤、当前要做的事和下一步主按钮（抽大组 → 使用该组 → 抽载具 → 确认抽取结果 → 填报比分），次要操作在旁边；抽取动画在 `BanPickDrawStrip`，引导栏通过它的 `draw(kind)` 抽取。`GET /banpick/stats?tier=&kind=&type=&player=&vehicle=`（`lib/banpick-stats.js`，按比赛类型统计最常被禁的大组、出场最多 / 最常被移出的载具，撤销的步骤不计；带 `player` 时另给该选手的禁用和常用载具，再带 `vehicle` 时给他开这辆载具的战绩 `player.vehicle`）用于统计页、选手页和 BP 遮罩。赛事结束后结算页显示「载具出场与 Ban / Pick 记录」（`#lib/event-banpick.js`、`BanPickRecap.svelte`）。BP 轮到某位选手禁用时推送「轮到你禁用了」（`notifyBanTurn`，每轮每人一次）。

## OBS overlays

遮罩页 `routes/tournament/[id]/overlay`，场景组件在 `lib/components/overlay`。

- **样式**：用自己的深色青色风格：海军蓝径向背景 #1B3A63 → #0A1630、强调青色 `cyan-400` #22D3EE、面板 rgba(24,40,70,0.92)、次要文字 #AFC0D8 / #7184A3，A/B 仍是 `side-a` / `side-b`；画面文字全部英文（阶段名用 `stageLabels()` 的 `en` / `tag`，联赛 `tierEnglish()`，赛事标签 `eventTagsEnglish()`，均在 `#lib/overlay.js`）。公共部件：`OverlayTopBar`（logo、阶段步骤胶囊、右侧插槽）、`LeagueBadge`（段位图标，等级标记画成白色）。
- **场景**：`intro` 开场对阵（胜率和双方输赢的 MMR 变化）、`hybrid` 对阵图 + 侧栏、`versus` 对位预告（`MatchupScene.svelte`；原 `intermission` 场间场景已合并进来，旧的 `scene=intermission` 和服务器上存的 `intermission` 都按 `versus` 显示；双方段位、MMR、近 5 场、常用载具、数据对比和历史交手，`#lib/versus.js` 的 `headToHeadRecent`）、`banpick`、`ingame` 游戏内 HUD（透明底）。带 `scene=` 的浏览器源固定显示那个场景，不跟随控制台。
- **自动模式**：赛事开启了 BP（且有载具池）、直播对局还没开打（没有实时比分）时显示 `banpick`；确认结果后再停留 20 秒展示揭晓画面（从确认那一步的服务器时间算，有实时比分立即结束），然后转到 `ingame`；没有直播对局时显示 `hybrid`。
- **Ban / Pick 场景**：三段动画：大组抽取全屏 → 大组面板缩到左侧、载具抽取占主体 → 结果揭晓。揭晓画面用 wiki 大图（`/api/vehicle-images/images/<unit>.png`，拿不到退回 slots 小图），底部选手栏显示双方开这辆载具的战绩（`WITH THIS 3W · 1L`，没打过显示 `FIRST PLAY`），右侧四张数据卡：性能、引擎、武器、襟翼与限速（拿不到数据时显示所在大组的载具和禁用）。载具数据由服务器从 War Thunder wiki 的载具页抓取（`apps/api/lib/vehicle-specs.js` 解析服务端渲染的 `.game-unit_chars-block` 和 `data-feature-popover`，`GET /api/vehicle-specs/:unit`，磁盘缓存 `.cache/vehicle-specs`，一周后后台刷新，失败一小时内不重试；页面结构变了就更新解析器和 `test/fixtures/wiki-*.html`，并把 `SPECS_VERSION` 加一），前端 `#lib/vehicle-specs.js` 的 `specCards()` 排成四张卡（按赛事 `game_mode` 取 RB / AB 数值）。
- **比赛开始倒计时**：按频道存（`live_channels.countdown_end`，迁移 045，`POST /tournaments/:id/countdown`，`{ seconds }`、`{ end }` 或 `{ clear: true }`）：HUD 以外的遮盖层顶栏右侧显示，最后 10 秒全屏，归零后自动模式和控制台选的场景都改显示 HUD（`?scene=` 指定的单场景链接不变）；之后在控制台换场景会清掉已结束的倒计时。倒计时按服务器时间算（用 `synced_at` 校正本机时钟）。
- **「我要直播」**：赛事页按阶段带大屏走完一场（`LiveHandoff.svelte`，每个计时阶段 30 秒，可「立即切换」或「延后 +30s」）：选下一场 → `versus` → 开启 BP 时 `banpick` 等结果确认（任何人确认都算，可「跳过 BP」）→ 准备开始游戏（画面不变）→ `ingame`；出结果后（任何途径）→ `hybrid` → 再弹出选下一场；管理员撤销 BP 结果会回到 BP 阶段，在控制台手动选场景会停止阶段。

## Live channels

直播状态按「频道」分（`axsuck.live_channels`，迁移 029）：每场赛事最多 9 个频道，每个频道有自己的当前直播对局（`active_match_id`）和大屏场景 / 阶段（`overlay_*`），同一对局同时只能在一个频道直播（唯一索引，冲突返回 409）。控制台在赛事页选频道（按赛事记在浏览器里，`#lib/live-channels.js`），OBS 遮罩用 `/tournament/<id>/overlay?channel=N`，不带参数就是频道 1。`GET /tournaments/:id` 返回 `live_channels`，顶层的 `active_match_id` / `overlay_*` 是频道 1 的值；`tournaments` 表上的同名旧列已在迁移 032 删除；对局被删除时，频道里的直播对局由外键自动清空。前端用 `withChannel(t, n)` 把某个频道的状态放回顶层字段，遮罩和控制台组件因此不用改。

## Check-in, reported results, personal push

迁移 034。**签到**：赛事可开启 `tournaments.checkin_enabled`，开赛前 30 分钟开放（`lib/checkin.js`，北京时间；没有时间就整个报名阶段开放），选手 `POST /tournaments/:id/checkin`，管理员任何时候可代签；开赛走 `POST /tournaments/:id/start {remove, forfeit}`：`remove` 的人移出并重排种子、重新生成对阵，`forfeit` 的人留下但标 `tournament_players.forfeited`，他们碰到的每场比赛自动判对手弃权胜（`lib/match-flow.js` 的 `settleForfeits`，每次出结果后都会跑）。**比分确认**：管理员提交的结果立即生效；选手提交的比分存进 `matches.pending_report`（JSONB），对手确认（或提交相同比分）才生效，提交不同比分或点「有异议」就标为争议，由管理员选一方生效或驳回；没人异议的比分 10 分钟后由 `lib/report-scheduler.js` 自动生效；选手申报对手弃权一律要管理员确认。规则在 `lib/match-reports.js`（纯函数，有测试）。**个人推送**：`push_subscriptions.player_id` 记录订阅者（带设备密钥校验），`lib/push-sender.js` 只推给指定选手；对阵双方确定时推「轮到你了」，对手提交比分时推「请确认比分」，BP 轮到自己禁用时推「轮到你禁用了」，每条只发一次（`push_match_notices`）。

## Reminders

顶栏铃铛是「提醒中心」（`components/layout/ReminderCenter.svelte`），三种渠道互补：
- **日历订阅**（推荐，国内也能用）：`GET /api/calendar.ics` 是全部未结束赛事，`?player=<id>` 是该选手报名的赛事（旧 ID 经 `player_aliases` 仍有效）。闹钟由手机/电脑日历自己响：全部赛事开赛前 1 小时；个人日历 1 小时 + 10 分钟，需要签到的再加 30 分钟（`lib/calendar.js`，`ALARMS`）。日历每小时自动刷新。
- **浏览器通知**（Web Push）：`.env` 有 `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` 就用它；没有的话第一个浏览器开启通知时服务器自己生成一对存进 `app_secrets`（迁移 046，`lib/push-keys.js`），之后不能再换。`POST /push/test` 给本浏览器发测试通知（每分钟一次）。国内安卓 Chrome 依赖 FCM，常常收不到，所以面板里推荐日历。
- **QQ 群**（`apps/bot`，迁移 047）：社区机器人把比赛就绪、请确认比分、轮到禁用、赛果和开赛前 1 小时提醒发到 QQ 群，并 @ 选手资料里的 QQ 号（`lib/bot-notices.js` 排队，`GET /bot/notices` 取用）；新赛事创建时发「开放报名」公告；官方机器人在群里被 @ 时回答「报名」「取消报名」「签到」「赛程」「战绩」（报名规则和网站共用 `lib/registration.js`），选手先在提醒中心的「QQ 群提醒」获取绑定码，再 @机器人 发送「绑定 123456」。API 和机器人的 `.env` 都要设置相同的 `BOT_TOKEN`。
- **网页内提醒**：开着网站时每 30 秒轮询 `GET /api/reminders/:playerId`（`lib/attention.js`：确认比分、轮到禁用、轮到比赛、签到开放、1 小时内开赛），页头下方横幅（`AttentionBanner.svelte`）、新提醒提示音、后台标签页标题闪烁（`lib/reminders.svelte.js`）；横幅可按条关闭，偏好存 localStorage。

## Admin tools

**复制上一场**：大厅的「复制上一场」和创建弹窗的「复制已有赛事」用 `#lib/create-event.js` 的 `formFromEvent` 把旧赛事的设置（赛制、模式、类型、积分表、签到、等级、载具池模板）填进表单，名称里的数字 +1（`nextEventName`），时间按同一星期几顺延到下一周之后（`nextWeekTime`，北京时间）；直邀名额不复制。**比赛日控制台** `/tournament/<id>/console`（管理员）：直播频道、需要管理员处理的争议和弃权申报、等待确认的比分（含自动生效倒计时）、可开打和等待中的比赛、未签到选手，分类在 `#lib/match-day.js`。 `site_settings`（迁移 035，原来给 Discord 播报）已在迁移 036 删除。

## Auto scene switching

`tools/wt-autoscene/` 是在直播电脑上运行的独立小程序（Node 22，无依赖）：读取战争雷霆本地接口 `localhost:8111` 的 `map_info.json` / `mission.json`，判断机库 / 战斗中，把"从战斗回到机库"当作比赛结束（观战时 `mission.json` 一直是 running），然后调用 `POST /tournaments/:id/overlay-state` 切换某个直播频道的大屏场景（保留当前轮次），也可以通过 obs-websocket v5 切 OBS 场景。判断规则在 `detect.mjs`（有测试）；`--record` 记录原始数据用于校准。

## Hall of fame and sharing

`GET /hall-of-fame`（`lib/hall-of-fame.js`）：每场结束赛事的领奖台（`eventPlacements`，预选赛列出但不计冠军）和全部纪录（冠军、登台、参赛、胜场、最长连胜、最高 MMR，后三项来自天梯历史），在统计页的「名人堂」标签（`/stats#hall`：上面是全部赛事的生涯榜单（冠军、亚军、胜率、场数、弃权，`RankingBoards`，不受统计页筛选影响），下面是纪录：登台、最长连胜、历史最高 MMR，另列每个赛季各类型的积分榜第一；旧链接 `/hall` 会跳转过去）。统计页的「载具」标签（`/stats#vehicles`，`BanPickStats`）列出每个大组的禁用 / 禁用率 / 抽中 / 出场、每辆出场载具和占比、选手禁用偏好（`banners`：每位禁用过的选手，含场次和最常禁的 5 个大组）。赛事结束后「分享到 Discord」可以生成 1080×1350 的结果图（`#lib/result-image.js`，浏览器 canvas 绘制，保存或复制）；赛事链接的预览图是 `static/og-image.png`（`summary_large_image`）。

## Event tiers

赛事有等级（`tournaments.tier`：S / A / B / C / D，对应 Liquipedia 的 liquipediatier 1–5）和性质（`event_kind`：major 大型赛事 / weekly 周赛 / qualifier 预选赛；迁移 043 把原来的季度赛、月赛并入大型赛事，「其他」改为未设置，旧值 season / monthly 仍会被认作 major），迁移 031 按 Liquipedia 页面回填导入的赛事，其余按积分榜类型（大型赛事 B、周赛 C）。规则在 `apps/api/lib/event-tier.js`，前端标签在 `#lib/tournament.js`（`EVENT_TIERS` / `EVENT_KINDS`）。管理员在赛事页顶部修改；`GET /players/statistics?tier=&kind=` 只统计该等级 / 性质的赛事，并返回按等级的冠军数和亚军数（`championships_by_tier` / `runner_ups_by_tier`，亚军 = 单独第 2 名，榜单 `rankings.by_runner_ups`）；预选赛按 `event_kind` 判断，不计冠亚军。Wiki 导出默认用赛事等级。

## Liquipedia export

赛事页「导出 Wiki」由 `apps/api/lib/liquipedia/export.js` 生成，版式照 Potato Cup 页面：瑞士轮周赛（Potato_Cup_Weekly/12）、双败（Potato_Cup/2026/Aug/Asia_Pacific）、瑞士轮小组 + 双败淘汰（Potato_Cup/2026/June/Europe）、双败小组 + 双败淘汰（Potato_Cup/2026/Fall/Europe，每组晋级 2 人用 `Bracket/8-1Q-U-4L2DSL1D-1Q` 这类模板）。赛制、Bo（按比分推算）、积分（赛事积分表）、参赛者、对阵来自赛事；奖金、直通资格、解说、直播等存在 `tournaments.wiki_meta`（迁移 028，`export-meta.js` 校验），新赛事沿用上一场的解说和直播。双败 4–16 人和每组晋级 2 人的 4–8 人双败小组的模板结构存在 `lib/liquipedia/de-templates.js`（取自 Liquipedia commons 的 TemplateMatch），导出时从决赛倒推、按晋级关系把每场对到模板的 R#M# 上（轮空不占位）；没有存模板的人数按列推算（双败胜者组第 u 轮在第 2u-2 列）并给出提示。

## History

2026-10 重写过公开历史，移除了真实录像、玩家 Battle.net 数据和旧凭证。见 `HISTORY.md`。同月移除了 SC2 录像上传/解析功能（`match_replays` 表已丢弃）。同月把选手资料里的 Battle.net 服务器标签换成 QQ / Discord 联系方式（`battle_tags` 新键 `qq` / `discord`，迁移 008），国籍改用 `apps/web/static/flags/<iso>.svg` 本地国旗，不再依赖 emoji。之后移除了 Battle.net 账号关联（`players.bnet_ids`、`tournament_player_accounts`，迁移 026）和种族字段；`battle_tags` 列名保留，现在只存联系方式。2026-11 移除了时间投票里的自定义选项投票（服务器 / 地图等），`custom_votes` 表在迁移 039 删除，时间投票不受影响。
