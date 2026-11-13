# 战争雷霆自动切换直播画面

在直播电脑（观战用的游戏客户端和 OBS 在同一台）上运行的小程序，带设置面板。它每秒读取游戏自带的本地接口 `http://localhost:8111`（游戏的"网页地图"，只读，不读内存、不改游戏文件），判断机库 / 战斗中 / 本局结束，把状态报给网站。网站大屏收到后自己切换画面，切换时带大屏的转场动画：

| 游戏 | 网站大屏 |
|---|---|
| 进入战斗 | 游戏内 HUD（透明底，露出下面的游戏画面） |
| 离开战斗回到机库（再等 `endDelay` 秒，默认 8，让观众看完结算） | 对阵图；网站控制台提醒裁判填写比分 |
| 在机库 | 按控制台的选择：Auto 模式下是 Ban / Pick → 揭晓 → 对位预告，等下一场战斗 |

- 观战时游戏接口在整场战斗中一直报告 `running`，所以"从战斗回到机库"就是比赛结束。
- 战斗不满 `minBattle` 秒（默认 60）就退出的，不算比赛结束（掉线、进错房间），大屏不切到对阵图。离开后 `endDelay` 秒内又回到战斗的，也什么都不做。
- 加载地图和退出战斗时接口会有几秒没有响应，这是正常的，不会触发切换。
- 在网站控制台选场景会接管大屏，直到下一次游戏状态变化。

## 下载和使用（推荐）

下载 [PotatoCup-AutoScene.exe](https://github.com/VermilionLP/potato-cup-tournament-platform/releases/download/autoscene/PotatoCup-AutoScene.exe)（网站直播控制台里也有下载链接），放进一个单独的文件夹，双击运行。不用安装 Node.js。

- 双击后会打开一个黑色窗口（程序本体，关掉它程序就退出）和一个面板窗口。面板关掉不影响运行，再双击程序就会重新打开面板。
- 第一次运行时 Windows 可能提示"已保护你的电脑"（程序没有付费签名）：点「更多信息」→「仍要运行」。
- 设置保存在程序旁边的 `config.json`，和命令行版通用。

面板里：

1. **网站**：填网站地址和管理员令牌，点「检测并读取赛事」，然后选赛事和直播频道。这里还能复制 OBS 浏览器源地址。
2. **游戏**：游戏接口地址（观战客户端在本机就不用改），可以点「检测」确认读得到；还有结算等待和最短战斗两个时间。
3. **OBS**：一般不用开，见下面。
4. **高级**：打开程序后自动开始、试运行、记录校准数据。
5. 点「开始」。上方显示游戏和大屏现在的状态（战斗计时、几秒后切到对阵图），下面三块分别是游戏、网站、OBS 的连接情况，右边是日志。「暂停自动切换」和网站控制台的「暂停自动」按钮是同步的。

运行中改了设置，保存后程序会按新设置重新开始。

## 准备 OBS

OBS 里只需要一个直播场景，从下到上：

1. 游戏画面采集（观战客户端）。
2. 浏览器源 `https://你的网站域名/tournament/赛事ID/overlay?channel=1`（面板「网站」页可以复制；不带 `scene=`，跟随频道）。不要勾选"不可见时关闭源"。

画面切换都由网站大屏完成，OBS 不用切场景，转场动画就不会丢。

网站控制台「OBS 直播大屏控制」里能看到程序是否在线、游戏当前状态。程序每 10 秒报到一次，超过 75 秒没有消息就显示离线，大屏回到不用程序时的行为。

## 也切 OBS 场景（可选）

一般不需要。确实要切 OBS 场景（比如每个场景有不同的摄像头布局）时：OBS → 工具 → WebSocket 服务器设置，勾选"开启 WebSocket 服务器"，然后在面板「OBS」页勾选「同时切换 OBS 场景」，填地址（如 `ws://127.0.0.1:4455`）和密码，点「连接并读取场景」，再选战斗中 / 本局结束 / 机库各切到哪个场景（留空的不切）。命令行版对应 `config.json` 的 `obs`、`obsPassword`、`obsBattle` / `obsEnded` / `obsHangar`。注意：OBS 切场景时浏览器源之间没有大屏的转场动画。

## 用 Node.js 运行（不用 exe）

装了 [Node.js 22 或更新版本](https://nodejs.org/) 的话，也可以直接运行源码：

- 面板：`node panel.mjs`（和 exe 一样；`--dir` 指定 config.json 所在的文件夹，`--no-open` 不打开窗口）。
- 一键启动命令行版：双击 `start-autoscene.bat`（第一次运行会创建 `config.json` 并用记事本打开；运行中按 **P** 暂停 / 恢复，关闭窗口或 Ctrl+C 停止）。

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

## 打包 exe

```bash
node tools/wt-autoscene/build-exe.mjs --version 2026.11.13
```

用 esbuild 把 `panel.mjs`（连同 `engine.mjs`、`config.mjs`、`detect.mjs` 和 `panel.html`）打成一个文件，再用 pkg 和 Node.js 22 打包成 `dist/PotatoCup-AutoScene.exe`（Linux 上也能打 Windows 版；构建工具第一次会装到 `.build-tools/`）。合并到 main 后 `.github/workflows/autoscene-exe.yml` 会自动打包并更新 `autoscene` 这个 release，下载链接不变。

## 说明

- 只负责切换画面，不会自动报分：观战视角下胜负归属不可靠，比分仍由裁判在赛事页填写。
- 网站接口：`POST /api/tournaments/:id/game-state {channel, state}`（每 10 秒和每次变化），`POST /api/tournaments/:id/autoscene {channel, paused}`。
- 文件：`detect.mjs` 判断规则；`engine.mjs` 读游戏、报网站、切 OBS（面板和命令行共用）；`panel.mjs` + `panel.html` 面板（只监听 127.0.0.1，请求要带窗口地址里的密钥）；`wt-autoscene.mjs` 命令行；`config.mjs` 设置。
- 测试：`node --test tools/wt-autoscene/test.mjs`（含一个用假游戏接口和假网站跑完整一局的测试）。
