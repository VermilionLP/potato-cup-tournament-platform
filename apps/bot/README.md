# Potato Cup QQ 机器人

一个 Koishi 进程同时运行两个机器人，都只通过网站 API 读写数据，自己不存任何东西：

| | 官方机器人（QQ 开放平台） | 社区机器人（NapCat） |
|---|---|---|
| 角色 | 前台：选手 @ 它时回复 | 广播：提醒、通知、战报 |
| 连接 | WebSocket 连 QQ 官方网关 | OneBot v11 正向 WebSocket，`127.0.0.1:3001` |
| 配置 | `.env` 里的 `QQ_*` | `.env` 里的 `ONEBOT_*` |

哪一段配置填了，哪个机器人才会启动，所以可以先只上线其中一个。两个机器人都**不做群管理**（审核、禁言、踢人、撤回由真人管理员负责），社区机器人只在 `ONEBOT_GROUPS` 列出的群里说话，不回私聊。

## 功能

**社区机器人：群通知**（发到 `ONEBOT_NOTICE_GROUP`，默认 `ONEBOT_GROUPS` 的第一个群）

| 通知 | 时机 | @ 谁 |
|---|---|---|
| 比赛就绪 | 对阵双方确定 | 双方 |
| 请确认比分 | 对手提交比分 | 要确认的一方 |
| 轮到禁用 | Ban/Pick 轮到某人 | 该选手 |
| 赛果 | 比分生效、弃权判负 | 不 @ |
| 开放报名 | 管理员创建新赛事时 | 不 @ |
| 开赛提醒 | 开赛前 1 小时（报名阶段的赛事） | 所有报名选手 |

@ 的是选手个人资料里填的 QQ 号，只填了 Discord 的选手只出现名字。通知由网站排队（`apps/api/lib/bot-notices.js`），机器人每 10 秒取一次、逐条发送、每条间隔 3–7 秒；发不出去的下一轮再试，超过 30 分钟就不再发。

**官方机器人：查询指令**（在群里 @土豆杯机器人 后发送；英文别名也可以）

| 指令 | 作用 |
|---|---|
| `绑定 123456` / `bind` | 绑定选手。绑定码在网站右上角铃铛 →「QQ 群提醒」里获取，10 分钟有效 |
| `报名` / `register` | 列出正在报名的赛事（带编号、人数、我是否已报名） |
| `报名 1`（或赛事名） | 报名第 1 个赛事，规则和网站一样（联系方式、天梯限制、名额） |
| `取消报名 1` / `withdraw` | 退出报名；只报了一个时可以不写编号；报名截止后要找管理员 |
| `签到` / `checkin` | 签到开放时，一次签到所有需要签到的赛事 |
| `赛程` / `schedule` | 我报名的未结束赛事，以及现在要做的事（确认比分、禁用、开打） |
| `战绩` / `stats`，`战绩 选手名` | 参赛次数、胜负、小局、冠亚军 |
| `解绑` / `unbind` | 解除这个 QQ 的绑定 |
| `帮助` / `help` | 指令列表 |
| `状态` / `status` | 检查机器人和网站是否在线（两个机器人都会回答） |

指令前面加不加 `/` 都可以（`/赛程` 和 `赛程` 一样）；指令和数字之间的空格也可以省略（`绑定123456`、`报名1`、`取消报名1`、`签到1`）。在 QQ 机器人后台登记这些指令后，用户在聊天框输入 `/` 就能看到指令列表。

`帮助`、`报名`（列表）、`赛程`、`战绩` 的回复是图片卡片（`src/cards.js`），样子和网站页面一致：黑色顶栏和 POTATO CUP 字标、橙色图标方块的页面标题、浅底白卡片、网站同款标签（级别 · 类型、模式、载具池、赛制、带圆点的状态）和 lucide 图标（`src/icons.js`），底部印网站地址（`.env` 的 `SITE_PUBLIC_URL`）。每张卡片都写明下一步该发什么指令（「发送 报名 1」这样的指令块，主要的一步是橙色）：

- **报名**：每个赛事旁是它自己的指令（报名 N / 取消报名 N / 签到），下面是「怎么报名」步骤条（绑定 → 报名 → 签到 → 比赛），按这位选手的进度标出已完成和当前一步；没绑定时步骤条放在最上面。
- **赛程**：「现在要做」（禁用、确认比分、开打）写明怎么做，并给出这场比赛的网址；每个赛事标出签到状态；没有比赛时给出报名步骤。
- **战绩**：胜率、胜负、冠亚军、天梯段位和 MMR 走势；没有记录时引导报名。
- **帮助**：新手步骤和按用途分组的全部指令。

排版用 Satori、生成 PNG 用 resvg；中文用网站同款 HarmonyOS Sans SC，标题和数字用 Barlow Condensed；字标在 `assets/`，国旗和段位图标取自 `apps/web/static`，不需要服务器安装字体。战绩卡另外读取天梯数据，没有天梯记录的选手只显示比赛战绩。生成失败时自动改发文字。每张图生成约 0.2–0.4 秒，机器人内存多占用约 100 MB。

QQ 给官方机器人的用户标识（openid）在群聊和私聊里不一样，所以在群里绑定的只在群里有效。

这两部分都需要 API 和机器人的 `.env` 里有相同的 `BOT_TOKEN`；没有的话只剩 `状态`。

## 文件

| 路径 | 作用 |
|---|---|
| `src/index.js` | 入口：加载适配器、群白名单、`状态` 指令，启动通知和指令 |
| `src/config.js` | 读取并检查 `.env` |
| `src/notices.js` | 社区机器人：取通知、@ 选手发群消息、标记已发送 |
| `src/commands.js` | 官方机器人：绑定、赛程、战绩等指令 |
| `src/format.js` | 指令回复的文字（图片失败时的备用） |
| `src/cards.js` | 帮助、报名、赛程、战绩的图片卡片 |
| `src/icons.js` | 卡片用的 lucide 图标（和网站同一套） |
| `assets/wordmark.png` | 顶栏的 POTATO CUP 字标（网站 `logo-wordmark-64.webp` 转成 PNG） |
| `src/site.js` | 调用网站 API（带 `BOT_TOKEN`） |
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
   - 「服务范围」里保持"允许被添加到任意群聊"关闭，由你自己把机器人拉进群；不要把群加进"白名单群聊"（那是撤回、禁言、踢人等管理权限）
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
QQ_SANDBOX=false

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

### 六、打开通知和查询（BOT_TOKEN）

生成一个随机令牌，同时写进网站和机器人的配置：

```bash
TOKEN=$(openssl rand -hex 24)
for f in /home/admin/suck/apps/api/.env /home/admin/suck/apps/bot/.env; do
  if grep -q '^BOT_TOKEN=' "$f"; then sed -i "s|^BOT_TOKEN=.*|BOT_TOKEN=$TOKEN|" "$f"; else echo "BOT_TOKEN=$TOKEN" >> "$f"; fi
done
grep -c "^BOT_TOKEN=$TOKEN" /home/admin/suck/apps/api/.env /home/admin/suck/apps/bot/.env   # 两个文件都应显示 1
pm2 restart suck-tournament --update-env
pm2 restart potato-bot
```

### 七、验证

- 在 Potato Cup 群里发 `状态` → 社区机器人回复"社区机器人在线。网站 API：正常"
- 在群里 `@官方机器人 状态` → 官方机器人回复"官方机器人在线。网站 API：正常"

## 常见问题

| 现象 | 原因和处理 |
|---|---|
| 日志里获取 AccessToken 报 11298 或 IP 相关错误 | 服务器公网 IP 不在开放平台的 IP 白名单里 |
| 日志反复出现 `invalid intents` | `QQ_INTENTS` 填错，删掉这一行使用默认值 |
| 连接的是 `sandbox.api.sgroup.qq.com` 且被拒绝 | 新版后台没有沙箱，设置 `QQ_SANDBOX=false` |
| 官方机器人在线但群里 @ 它没反应 | 机器人还没被拉进这个群 |
| `adapter failed to connect to ws://127.0.0.1:3001`，code 1006 | NapCat 没在运行或还没登录：`cd /home/admin/napcat && docker compose ps`，再看 `docker compose logs napcat` |
| 连上后立刻断开、提示鉴权失败 | `apps/bot/.env` 的 `ONEBOT_TOKEN` 与 `/home/admin/napcat/.env` 不一致 |
| 社区机器人在某个群不回复 | 群号不在 `ONEBOT_GROUPS` 里（这是有意的） |
| 日志提示 `BOT_TOKEN is not set` | 按「六」设置 `BOT_TOKEN`，两边要一样 |
| 群里没有比赛通知 | API 的 `.env` 没有 `BOT_TOKEN`（不会排队），或两边不一致（机器人日志有 401） |
| @ 官方机器人「赛程」回复"还没有绑定" | 在网站获取绑定码后 @机器人 发送「绑定 123456」；在私聊用要另外绑定 |
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

内存参考：NapCat 容器限制为 1 GB，`potato-bot` 超过 500 MB 时 PM2 会自动重启它。

## 开发

```bash
pnpm --filter potato-cup-bot test   # 单元测试，不需要网络
pnpm dev:bot                        # 本地运行，读取 apps/bot/.env
```

Koishi 通过 `require` 加载（它的 ESM 入口在 Node 22 上无法加载，而适配器用的也是 CommonJS 版本），并需要手动加载 `@koishijs/plugin-http`，否则适配器会一直等待 HTTP 服务。
