# 战争雷霆自动切换直播画面

在直播电脑（观战用的游戏客户端和 OBS 在同一台）上运行。它每秒读取游戏自带的本地接口 `http://localhost:8111`（游戏的"网页地图"，只读，不读内存、不改游戏文件），判断机库 / 战斗中 / 本局结束，把状态报给网站。网站大屏收到后自己切换画面，切换时带大屏的转场动画：

| 游戏 | 网站大屏 |
|---|---|
| 进入战斗 | 游戏内 HUD（透明底，露出下面的游戏画面） |
| 离开战斗回到机库（再等 `endDelay` 秒，默认 8，让观众看完结算） | 对阵图；网站控制台提醒裁判填写比分 |
| 在机库 | 按控制台的选择：Auto 模式下是 Ban / Pick → 揭晓 → 对位预告，等下一场战斗 |

- 观战时游戏接口在整场战斗中一直报告 `running`，所以"从战斗回到机库"就是比赛结束。
- 战斗不满 `minBattle` 秒（默认 60）就退出的，不算比赛结束（掉线、进错房间），大屏不切到对阵图。离开后 `endDelay` 秒内又回到战斗的，也什么都不做。
- 加载地图和退出战斗时接口会有几秒没有响应，这是正常的，不会触发切换。
- 在网站控制台选场景会接管大屏，直到下一次游戏状态变化。

不需要安装依赖，只需要 [Node.js 22 或更新版本](https://nodejs.org/)。

## 准备 OBS

OBS 里只需要一个直播场景，从下到上：

1. 游戏画面采集（观战客户端）。
2. 浏览器源 `https://你的网站域名/tournament/赛事ID/overlay?channel=1`（不带 `scene=`，跟随频道）。不要勾选"不可见时关闭源"。

画面切换都由网站大屏完成，OBS 不用切场景，转场动画就不会丢。

## 一键启动

双击 `start-autoscene.bat`：

1. 第一次运行会创建 `config.json` 并用记事本打开。填写 `site`（网站地址，如 `https://example.com`）和 `adminToken`（管理员令牌），保存并关闭记事本。
2. 启动时会询问赛事 ID 和直播频道（回车沿用上次的值）。频道就是赛事页直播控制台里选的频道。
3. 运行中按 **P** 暂停 / 恢复自动切换（大屏不再跟随游戏，按控制台选的场景显示）；网站控制台的「暂停自动」按钮效果一样，两边同步。
4. 停止：关闭窗口或按 Ctrl+C。

网站控制台「OBS 直播大屏控制」里能看到脚本是否在线、游戏当前状态。脚本每 10 秒报到一次，超过 75 秒没有消息就显示离线，大屏回到不用脚本时的行为。

`config.json` 只保存在这台电脑上（已加入 .gitignore）。想先试运行就把 `dryRun` 改成 `true`；要记录校准数据就把 `record` 填成 `wt-log.jsonl`。

## 也切 OBS 场景（可选）

一般不需要。确实要切 OBS 场景（比如每个场景有不同的摄像头布局）时：OBS → 工具 → WebSocket 服务器设置，勾选"开启 WebSocket 服务器"，然后在 `config.json` 填 `obs`（如 `ws://127.0.0.1:4455`）、`obsPassword`，以及 `obsBattle` / `obsEnded` / `obsHangar`（OBS 里的场景名，留空的不切）。注意：OBS 切场景时浏览器源之间没有大屏的转场动画。

## 命令行使用（Windows PowerShell）

```powershell
cd 路径\potato-cup-tournament-platform\tools\wt-autoscene
$env:POTATO_ADMIN_TOKEN = "管理员令牌"
node wt-autoscene.mjs --site https://你的网站域名 --event 赛事ID --channel 1
```

- 令牌放在环境变量或本机的 config.json 里，不要写在命令行参数里。
- `--end-delay 8`、`--min-battle 60` 对应上面的两个时间。
- 先加 `--dry-run` 试运行：只打印会做什么，不实际报告。
- 观战客户端在另一台电脑上时，用 `--game http://那台电脑的IP:8111`（那台电脑的防火墙要放行 8111 端口）。

## 校准：记录模式

游戏接口的字段需要用真实比赛确认。比赛时加上 `--record wt-log.jsonl`，状态每变一次就记一行（不含地图网格）。打完一两局后把这个文件发给开发者，用来调整"战斗结束"的判断。

```powershell
node wt-autoscene.mjs --record wt-log.jsonl
```

## 说明

- 只负责切换画面，不会自动报分：观战视角下胜负归属不可靠，比分仍由裁判在赛事页填写。
- 网站接口：`POST /api/tournaments/:id/game-state {channel, state}`（每 10 秒和每次变化），`POST /api/tournaments/:id/autoscene {channel, paused}`。
- 判断逻辑在 `detect.mjs`，测试：`node --test tools/wt-autoscene/test.mjs`。
