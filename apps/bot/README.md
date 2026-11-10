# Potato Cup QQ 机器人

一个 Koishi 进程同时运行两个机器人，都只通过网站 API 读写数据，自己不存任何东西：

| | 官方机器人（QQ 开放平台） | 社区机器人（NapCat） |
|---|---|---|
| 角色 | 前台：选手 @ 它时回复 | 广播：提醒、通知、战报 |
| 连接 | WebSocket 连 QQ 官方网关 | OneBot v11 正向 WebSocket，`127.0.0.1:3001` |
| 配置 | `.env` 里的 `QQ_*` | `.env` 里的 `ONEBOT_*` |

哪一段配置填了，哪个机器人才会启动，所以可以先只上线其中一个。两个机器人都**不做群管理**（审核、禁言、踢人、撤回由真人管理员负责），社区机器人只在 `ONEBOT_GROUPS` 列出的群里说话，不回私聊。

目前只有一个 `状态` 指令，用来检查"QQ → 机器人 → 网站 → QQ"这条链路是否通。

## 文件

| 路径 | 作用 |
|---|---|
| `src/index.js` | 入口：加载适配器、群白名单、`状态` 指令 |
| `src/config.js` | 读取并检查 `.env` |
| `napcat/compose.yaml` | NapCat 容器（端口只绑定本机） |
| `ecosystem.config.cjs` | PM2 进程 `potato-bot` |
| `../../scripts/bot-setup.sh` | 服务器一键准备 |

## 上线步骤

### 一、先在服务器外准备好（只能你自己做）

1. **社区机器人用的 QQ 号**：用注册较久、有正常使用记录的号，先手动加入 Potato Cup 群。不需要给它管理员。
2. **QQ 开放平台**（[q.qq.com](https://q.qq.com)）：
   - 手机 QQ 扫码登录，未实名的号要先实名，然后创建机器人
   - 「开发设置」里记下 **AppID** 和 **AppSecret**（AppSecret 只显示一次，立刻保存）
   - 「开发设置」的 **IP 白名单** 填服务器公网 IP
   - 「沙箱配置」里添加测试用的群；正式上线前机器人只能在沙箱群里使用
3. **Docker 镜像加速地址**：阿里云控制台 → 容器镜像服务 → 镜像工具 → 镜像加速器，复制个人加速地址。大陆服务器直连 Docker Hub 通常拉不下来镜像。

### 二、部署代码

把这部分代码合并到 `main` 后，照常部署：

```bash
bash /home/admin/suck/scripts/deploy.sh --git
```

### 三、运行准备脚本

```bash
bash /home/admin/suck/scripts/bot-setup.sh --mirror https://xxxx.mirror.aliyuncs.com
```

它会检查环境、安装 Docker（Alibaba Cloud Linux 3 / CentOS 系）、在 `/home/admin/napcat` 生成 NapCat 配置和随机令牌并启动容器、创建 `apps/bot/.env`。重复运行是安全的：已有的令牌、`.env` 和 Docker 设置都不会被覆盖。

### 四、登录 NapCat

WebUI 只监听服务器本机，要从你自己的电脑开一条 SSH 隧道：

```bash
ssh -L 6099:127.0.0.1:6099 admin@<服务器IP>
```

保持这个窗口不关，浏览器打开 `http://127.0.0.1:6099/webui`，令牌是 `/home/admin/napcat/.env` 里的 `WEBUI_TOKEN`。用机器人 QQ 号扫码登录。登录信息保存在 `/home/admin/napcat/data/qq`，重启后不需要再扫码。

OneBot 的 WebSocket 服务（端口 3001 + 令牌）已经由脚本写好，**不需要**在 WebUI 里再配置网络。

### 五、填写 `.env` 并启动

编辑 `/home/admin/suck/apps/bot/.env`：

```ini
QQ_APP_ID=你的AppID
QQ_APP_SECRET=你的AppSecret
QQ_SANDBOX=true

ONEBOT_SELF_ID=机器人QQ号
ONEBOT_GROUPS=Potato Cup群号,测试群号
# ONEBOT_TOKEN 脚本已经填好，不要改
```

```bash
cd /home/admin/suck/apps/bot
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs potato-bot
```

之后每次 `deploy.sh` 部署都会自动重启 `potato-bot`。

### 六、验证

- 在 Potato Cup 群里发 `状态` → 社区机器人回复"社区机器人在线。网站 API：正常"
- 在沙箱群里 `@官方机器人 状态` → 官方机器人回复"官方机器人在线。网站 API：正常"

## 常见问题

| 现象 | 原因和处理 |
|---|---|
| 日志里获取 AccessToken 报 11298 或 IP 相关错误 | 服务器公网 IP 不在开放平台的 IP 白名单里 |
| 官方机器人在线但群里 @ 它没反应 | 该群不在沙箱配置里，或 `QQ_SANDBOX` 与平台设置不一致 |
| `adapter failed to connect to ws://127.0.0.1:3001`，code 1006 | NapCat 没在运行或还没登录：`cd /home/admin/napcat && docker compose ps`，再看 `docker compose logs napcat` |
| 连上后立刻断开、提示鉴权失败 | `apps/bot/.env` 的 `ONEBOT_TOKEN` 与 `/home/admin/napcat/.env` 不一致 |
| 社区机器人在某个群不回复 | 群号不在 `ONEBOT_GROUPS` 里（这是有意的） |
| `pm2 logs` 里不停出现配置错误后进程停止 | 按提示补全 `.env`，再 `pm2 restart potato-bot` |
| NapCat 掉线，需要重新扫码 | 重新开 SSH 隧道进 WebUI 扫码；频繁掉线说明账号被风控，降低发送频率 |
| 拉取镜像失败 | 运行脚本时加 `--mirror`；已有 `/etc/docker/daemon.json` 时要手动加 `registry-mirrors` |

## 日常维护

```bash
# 更新 NapCat（登录数据保留）
cd /home/admin/napcat && docker compose pull && docker compose up -d

# 查看状态
pm2 status
docker compose -f /home/admin/napcat/compose.yaml ps
```

内存参考：NapCat 容器限制为 1 GB，`potato-bot` 超过 300 MB 时 PM2 会自动重启它。

## 开发

```bash
pnpm --filter potato-cup-bot test   # 单元测试，不需要网络
pnpm dev:bot                        # 本地运行，读取 apps/bot/.env
```

Koishi 通过 `require` 加载（它的 ESM 入口在 Node 22 上无法加载，而适配器用的也是 CommonJS 版本），并需要手动加载 `@koishijs/plugin-http`，否则适配器会一直等待 HTTP 服务。
