# Suck Utilities

S.U.C.K（StarCraft Ultra Chicken King）水友赛的一整套工具：赛事前端与 API。

- `apps/web` — SvelteKit SPA（Svelte 5、Tailwind CSS v4、shadcn-svelte）
- `apps/api` — Fastify 5 + PostgreSQL（schema `axsuck`），SSE 实时推送、Swagger、可选 Python 录像解析

## 环境要求

- Node.js 20+（推荐 22）
- pnpm（仓库通过 `packageManager` 固定版本）
- PostgreSQL 14+
- 只有录像解析功能需要 Python 3 + `sc2reader` / `spawningtool`

## 快速开始

```bash
pnpm install

# 配置 API（数据库、端口、Web Push）
cp apps/api/.env.example apps/api/.env
# 编辑 DATABASE_URL 等

# 建表 / 升级
pnpm migrate

# 同时启动 API (:3100) 和前端 (:5175)
pnpm dev
```

前端开发服务器把 `/api` 代理到 `http://127.0.0.1:3100`，Swagger 文档在 `http://localhost:3100/docs`。

## 常用命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` / `pnpm dev:suck` | API + Web 并行开发 |
| `pnpm dev:api` / `pnpm dev:web` | 单独启动 |
| `pnpm migrate` | 运行 PostgreSQL 迁移 |
| `pnpm build:web` | 构建静态前端到 `apps/web/build` |
| `pnpm test` | Web + API 的单元测试（无需数据库） |

## 部署

1. `pnpm build:web` 生成 `apps/web/build`；
2. API 默认会从 `../web/build` 提供静态文件，也可以用 `STATIC_DIR` 指定目录；
3. 生产环境用 PM2 / systemd 之类的进程管理器运行 `node apps/api/app.js`。

录像解析需要服务器装好 `python3`、`sc2reader`、`spawningtool`，否则相关接口会返回友好错误，其余功能不受影响。

## 配置

- `apps/api/.env.example` — 端口、`DATABASE_URL`、QQ 群白名单、Web Push（VAPID）密钥、管理员令牌、Elasticsearch 日志
- 仓库里没有任何真实凭证；`apps/api/.env` 已被 gitignore

### 管理员令牌

在 `apps/api/.env` 设置 `ADMIN_TOKEN`（留空则管理员功能关闭）。赛事管理（创建/编辑/删除、阶段切换、种子排序、对阵生成、直播对局与大屏控制、账号关联）、比分修改/回滚/弃权判定、录像批量导入/重解析/删除、选手改名/合并等破坏性接口都需要在请求头携带 `x-admin-token`；前端点击右上角盾牌图标登录，令牌只存在当前标签页的 `sessionStorage`。

普通用户仍可自助完成：报名/取消报名、维护自己的资料与账号关联、投时间票/自定义票，以及由对局双方选手本人提交该场比分或弃权。后端会校验 `x-player-id` 与目标选手/对局是否匹配。

### Elasticsearch 日志

API 把请求日志和管理员审计日志异步写入 ES（默认 `http://127.0.0.1:9200`，按天索引 `suck-api-logs-YYYY.MM.DD`），可用 `ES_URL` / `ES_USERNAME` / `ES_PASSWORD` / `ES_INDEX` 覆盖；ES 不可用时只丢日志，不影响业务。详见 `apps/api/README.md`。

## 历史

早期的 SQLite 版本和完整的提交记录见 [HISTORY.md](./HISTORY.md)。公开仓库的历史已在 2026-10 重写，移除了真实录像、玩家 Battle.net 链接和凭证。
