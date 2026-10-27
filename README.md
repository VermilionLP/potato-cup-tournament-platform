# Potato Cup 赛事平台

WarThunder Potato Cup 水友赛的赛事平台：报名、时间投票、对阵（单败 / 双败 / 瑞士轮 / 小组赛 + 淘汰赛）、Ban/Pick、比分、OBS 直播遮罩、天梯 MMR、年度积分榜，以及 Liquipedia 导入和 wiki 生成。

仓库最初是星际争霸 2 水友赛工具 S.U.C.K（`suck-utilities`），所以包名、数据库 schema（`axsuck`）、PM2 进程名和部分存储键名还沿用 `suck`。

- `apps/web` — SvelteKit SPA（Svelte 5、Tailwind CSS v4、shadcn-svelte）
- `apps/api` — Fastify 5 + PostgreSQL（schema `axsuck`），SSE 实时推送、Swagger

## 环境要求

- Node.js 20+（推荐 22）
- pnpm（仓库通过 `packageManager` 固定版本）
- PostgreSQL 14+

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

线上服务器用 `bash scripts/deploy.sh --git` 部署（先 `git pull` 拿到最新的部署脚本）。部署前会备份代码和数据库；数据库备份也可以单独运行或加进 crontab，见 `scripts/backup-db.sh` 开头的说明（含恢复命令）。

## 配置

- `apps/api/.env.example` — 端口、`DATABASE_URL`、QQ 群白名单、Web Push（VAPID）密钥、管理员令牌、Elasticsearch 日志
- 仓库里没有任何真实凭证；`apps/api/.env` 已被 gitignore

### 管理员令牌

在 `apps/api/.env` 设置 `ADMIN_TOKEN`（留空则管理员功能关闭）。赛事管理（创建/编辑/删除、阶段切换、种子排序、对阵生成、直播对局与大屏控制、账号关联）、比分修改/回滚/弃权判定、选手改名/合并等破坏性接口都需要在请求头携带 `x-admin-token`；前端点击右上角盾牌图标登录，令牌只存在当前标签页的 `sessionStorage`。

普通用户仍可自助完成：报名/取消报名、维护自己的资料与账号关联、投时间票/自定义票，以及由对局双方选手本人提交该场比分或弃权。后端会校验 `x-player-id` 与目标选手/对局是否匹配。

### Elasticsearch 日志

API 把请求日志和管理员审计日志异步写入 ES（默认 `http://127.0.0.1:9200`，按天索引 `suck-api-logs-YYYY.MM.DD`），可用 `ES_URL` / `ES_USERNAME` / `ES_PASSWORD` / `ES_INDEX` 覆盖；ES 不可用时只丢日志，不影响业务。详见 `apps/api/README.md`。

## 历史

早期的 SQLite 版本和完整的提交记录见 [HISTORY.md](./HISTORY.md)。公开仓库的历史已在 2026-10 重写，移除了真实录像、玩家 Battle.net 链接和凭证。SC2 录像上传/解析功能已在 2026-10 移除。
