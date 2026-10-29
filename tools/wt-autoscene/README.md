# 战争雷霆自动切换直播画面

在直播电脑（观战用的游戏客户端和 OBS 在同一台）上运行。它每秒读取游戏自带的本地接口 `http://localhost:8111`（游戏的"网页地图"，只读，不读内存、不改游戏文件），根据状态自动切换：

| 游戏状态 | 网站大屏（默认） | OBS（可选） |
|---|---|---|
| 进入战斗 | `ingame` 游戏内 | `--obs-battle` |
| 战斗结束（等 `--end-delay` 秒，默认 8） | `intermission` 间歇 | `--obs-ended` |
| 回到机库 | `hybrid` 综合 | `--obs-hangar` |

不需要安装依赖，只需要 [Node.js 22 或更新版本](https://nodejs.org/)。

## 一键启动（推荐）

双击 `start-autoscene.bat`：

1. 第一次运行会创建 `config.json` 并用记事本打开。填写 `site`（网站地址，如 `https://example.com`）和 `adminToken`（管理员令牌），保存并关闭记事本。
2. 每次启动会问赛事 ID 和直播频道，直接回车沿用上次的值。
3. 停止：关闭窗口或按 Ctrl+C。

`config.json` 只保存在这台电脑上（已加入 .gitignore，不会被提交），里面有管理员令牌，不要发给别人。想先试运行就把 `dryRun` 改成 `true`；要切 OBS 就填 `obs`（如 `ws://127.0.0.1:4455`）、`obsPassword` 和 `obsBattle` / `obsEnded` / `obsHangar` 场景名；要记录校准数据就把 `record` 填成 `wt-log.jsonl`。

## 命令行使用（Windows PowerShell）

```powershell
cd 路径\potato-cup-tournament-platform\tools\wt-autoscene
$env:POTATO_ADMIN_TOKEN = "管理员令牌"
node wt-autoscene.mjs --site https://你的网站域名 --event 赛事ID --channel 1
```

- 令牌只放在环境变量里，不要写在命令行参数或文件里。
- `--channel` 是赛事页直播控制台里选的频道。
- 某个状态不想切换，就把对应场景设为 `none`，例如 `--scene-hangar none`。
- 先加 `--dry-run` 试运行：只打印会做什么，不实际切换。

### 同时切换 OBS 场景

OBS → 工具 → WebSocket 服务器设置：启用，记下端口和密码。

```powershell
$env:OBS_PASSWORD = "OBS WebSocket 密码"
node wt-autoscene.mjs --site https://你的网站域名 --event 赛事ID --obs ws://127.0.0.1:4455 --obs-battle "游戏画面" --obs-ended "间歇" --obs-hangar "间歇"
```

只想切 OBS、不动网站大屏时，不写 `--site` 和 `--event`。

## 校准：记录模式

游戏接口的字段需要用真实比赛确认。比赛时加上 `--record wt-log.jsonl`，状态每变一次就记一行（不含地图网格）。打完一两局后把这个文件发给开发者，用来调整"战斗结束"的判断。

```powershell
node wt-autoscene.mjs --record wt-log.jsonl
```

## 说明

- 只负责切换画面，不会自动报分：观战视角下胜负归属不可靠，比分仍由裁判在赛事页填写。
- 切换网站大屏会保留频道当前的轮次和阶段设置。
- 判断逻辑在 `detect.mjs`，测试：`node --test tools/wt-autoscene/test.mjs`。
