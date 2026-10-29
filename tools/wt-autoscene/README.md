# 战争雷霆自动切换直播画面

在直播电脑（观战用的游戏客户端和 OBS 在同一台）上运行。它每秒读取游戏自带的本地接口 `http://localhost:8111`（游戏的"网页地图"，只读，不读内存、不改游戏文件），判断机库 / 战斗中 / 战斗结束，然后切换场景。

有两种切换方式，可以只用一种：

| | 切 OBS 场景（推荐） | 切网站大屏 |
|---|---|---|
| 需要 | OBS WebSocket 密码 | 网站域名 + 管理员令牌 + 赛事 ID |
| 影响范围 | 只有这台电脑的 OBS | 该直播频道的所有大屏 |

| 游戏状态 | OBS 场景 | 网站大屏（默认） |
|---|---|---|
| 进入战斗 | `obsBattle` | `ingame` 游戏内 |
| 战斗结束（等 `endDelay` 秒，默认 8） | `obsEnded` | `intermission` 间歇 |
| 回到机库 | `obsHangar` | `hybrid` 综合 |

不需要安装依赖，只需要 [Node.js 22 或更新版本](https://nodejs.org/)。

## 准备 OBS（用浏览器源时）

1. OBS → 工具 → WebSocket 服务器设置：勾选"开启 WebSocket 服务器"，记下端口（默认 4455）和密码。
2. 每个场景放一个浏览器源，网址里用 `scene=` 固定大屏画面，例如：
   - 场景"游戏内"：游戏画面采集 + 浏览器源 `https://你的网站域名/tournament/赛事ID/overlay?channel=1&scene=ingame`
   - 场景"间歇"：浏览器源 `https://你的网站域名/tournament/赛事ID/overlay?channel=1&scene=intermission`
   带 `scene=` 的浏览器源不再跟随控制台的场景切换，但对局、比分、轮次仍然实时更新。
   浏览器源属性里不要勾选"不可见时关闭源"，这样切换场景时画面不用重新加载。
3. 把这些场景名填进 `config.json` 的 `obsBattle` / `obsEnded` / `obsHangar`（必须和 OBS 里的名字完全一致）。

## 一键启动

双击 `start-autoscene.bat`：

1. 第一次运行会创建 `config.json` 并用记事本打开。填写 `obsPassword`，把三个场景名改成 OBS 里的场景名，保存并关闭记事本。网站相关的 `site` / `adminToken` 留空即可。
2. 停止：关闭窗口或按 Ctrl+C。

`config.json` 只保存在这台电脑上（已加入 .gitignore）。想先试运行就把 `dryRun` 改成 `true`；要记录校准数据就把 `record` 填成 `wt-log.jsonl`；某个状态不想切换，就把对应场景名留空。

如果也要切网站大屏：填写 `site` 和 `adminToken`，启动时会询问赛事 ID 和频道（回车沿用上次的值）。

## 命令行使用（Windows PowerShell）

```powershell
cd 路径\potato-cup-tournament-platform\tools\wt-autoscene
$env:POTATO_ADMIN_TOKEN = "管理员令牌"
node wt-autoscene.mjs --site https://你的网站域名 --event 赛事ID --channel 1
```

- 令牌放在环境变量或本机的 config.json 里，不要写在命令行参数里。
- `--channel` 是赛事页直播控制台里选的频道。
- 某个状态不想切换，就把对应场景设为 `none`，例如 `--scene-hangar none`。
- 先加 `--dry-run` 试运行：只打印会做什么，不实际切换。

### 切换 OBS 场景

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
