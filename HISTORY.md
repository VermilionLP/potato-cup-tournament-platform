# 项目历史

本仓库最初是 `suck-utilities`（SC2 水友赛工具），2026-06 起并入 Wayne-Monorepo 继续开发。
公开仓库只包含 `apps/api` 和 `apps/web`；独立的 `replay-process`（Challonge 拉取 / wiki 生成）工具不对外提供。
为了让仓库可以安全公开，2026-10 重写了 git 历史，移除了：

- `replays/` 下的真实 `.SC2Replay` 文件、`battlenet_ids.json`、`sc2_replay_data.json`
- 所有 `config.js`（含 Challonge API key），现在改为从环境变量读取
- `nvm-update.md`（服务器路径 / PM2 运维笔记）

完整提交记录仍保留在私有的 Wayne-Monorepo 中。下面是被移除前的提交时间线。

## 架构演进

| 时间 | 节点 |
|------|------|
| 2025-03 | 起步：SC2 录像解析、Challonge 拉取、Liquipedia wiki 脚本生成 |
| 2025-06 | 加入 Web UI（Fastify 静态服务 + 拖拽匹配录像） |
| 2026-02 | 后端完全迁移到 Fastify |
| 2026-06 | 重构为 pnpm monorepo（api / web / replay-process）；新增赛事前端、报名、投票、SSE、OBS overlay、CI 部署 |
| 2026-06 | SQLite → PostgreSQL（`axsuck` schema，Postgrator 迁移） |
| 2026-07 → 10 | 天梯 MMR、128 人赛制、Web Push、日历订阅、SC2 种族/段位图标等 |

## 提交时间线（2025-03 ～ 2026-07）

| 日期 | 提交 | 说明 |
|------|------|------|
| 2025-03-06 | 7e501b0 | Initial commit |
| 2025-03-06 | 9fbfd6a | init |
| 2025-03-07 | c657066 | docs: update README.md |
| 2025-03-07 | fa768f8 | gen_data function |
| 2025-03-07 | f9c3928 | fix ascii name |
| 2025-03-07 | 3b441ef | update replayreader.py |
| 2025-03-11 | c7cb816 | update: deleted cache files |
| 2025-03-11 | de686d6 | update replayreader.py |
| 2025-03-11 | b018cf8 | update .gitignore, generate_sc2_replay_data.py and main.py |
| 2025-03-11 | 1f6b9a4 | challonge v1 api |
| 2025-03-11 | e2ca76c | update main.py |
| 2025-03-11 | b6c8884 | feat: create config.js and main.js |
| 2025-03-11 | 47fb4c4 | update main.js |
| 2025-06-25 | 6079f57 | chore: update .gitignore |
| 2025-06-25 | 4599cb0 | feat: Initialize Tournament Analyzer project with core functionality |
| 2025-06-25 | f1e47f7 | v0.1 |
| 2025-06-25 | 26c2cb0 | feat: Enhance tournament analysis functionality with improved error handling and UI updates |
| 2025-06-26 | 237dfac | update main.js, public/index.html and script.js |
| 2025-06-29 | 6307ab1 | delete 1 file and update 3 files |
| 2025-06-29 | b976b27 | update 3 files and move 4 files |
| 2025-06-29 | 86f0ed1 | feat: Add sortable class to replay object and participant lists for improved UI interaction |
| 2025-06-29 | d0f1d93 | fix sortable class |
| 2025-06-29 | d6b6a96 | update main.js |
| 2025-06-30 | d12d999 | UTC version |
| 2025-06-30 | 9e28152 | update main.js, public/index.html and script.js |
| 2025-06-30 | 06aa4eb | update main.js |
| 2025-07-02 | 096b3af | update main.js |
| 2025-08-27 | f31cb5e | build: add project metadata and scripts to package.json |
| 2025-08-27 | 9c20db5 | fix(main): remove "invitation pending" suffix from player names |
| 2025-12-02 | 788471d | update deps |
| 2026-02-03 | 5c68b08 | refactor: streamline main.js, enhance UI in index.html, and improve script.js functionality |
| 2026-02-07 | d70e0ed | feat: add tournament analyzer and wiki generator |
| 2026-02-07 | 2368a40 | feat: implement mappings management and replay file handling |
| 2026-02-07 | 1650988 | feat: add README for Suck Utilities and remove legacy files |
| 2026-02-08 | edf370c | feat: enhance player mappings and add folder selection API |
| 2026-02-26 | bf99075 | 后端重构：完全迁移到 Fastify；移除 PowerShell 依赖与 pick-folder 接口 |
| 2026-03-17 | b8fc7cd | deps: update @fastify/static, fastify, sortablejs |
| 2026-04-21 | ccf1b11 | chore: update fastify and @fastify/static |
| 2026-05-23 | 92f399b | update mappings |
| 2026-05-23 | 808a62a | Merge branch 'main' |
| 2026-06-18 | d38ecb0 | add tournament web |
| 2026-06-18 | d0b3756 | changed to monorepo, add ci |
| 2026-06-18 | c1590f4 | Delete and merge player |
| 2026-06-18 | af4b894 | ip display |
| 2026-06-18 | b97739f | feat: navigation menu, user page with datatable |
| 2026-06-18 | 783109d | fix: encode/decode non-ASCII player IDs; disable SSE proxy buffering |
| 2026-06-18 | 98f253a | refactor: integrate @fastify/sse |
| 2026-06-19 | 9b3eb70 | feat: OBS 直播大屏与转场动画；比分回滚 |
| 2026-06-29 | bd05bc3 | feat(vote): generic custom voting topics |
| 2026-06-30 | d0d114b | wiki and replay parse bug fixes |
| 2026-06-30 | 8dd213f | pull data from challonge |
| 2026-06-30 | 7d66d24 | fix: user creation |
| 2026-07-04 | 484ae93 | feat: stats page, loser_advances rule, player race from replays |
| 2026-07-06 | 0544e4e | fix: return id as displayname |

> 2026-07 之后的开发（PostgreSQL、天梯、128 人、Push、日历等）在 Wayne-Monorepo 的 `apps/suck-*` 下，已同步到本仓库。
