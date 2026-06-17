# Suck Utilities (Tournament Analyzer)

一个专为星际争霸II (SC2) 水友赛设计的自动化工具，旨在简化从比赛录像到 Liquipedia 维基脚本生成的全过程。

## 核心功能

- **自动化录像解析**：基于 Python 的 `sc2reader` 快速提取录像中的玩家 ID、种族、地图、胜负及比赛时间。
- **Challonge 集成**：自动获取锦标赛对阵表，支持单淘 (Single Elimination) 及多种赛制。
- **智能玩家匹配**：
  - 建立持久化的 `mappings.json`，自动关联 Challonge 昵称与多个 Battle.net 账号。
  - 支持通过唯一战网 URL 进行匹配，防止重名干扰。
- **容器化对阵关联**：
  - 支持拖拽匹配，解决 BO3/BO5 中一个对阵对应多个录像的问题。
  - 自动识别录像时间并按顺序排列。
- **一键生成维基脚本**：自动生成符合 Liquipedia 规范的 `{{Match}}` 及 `{{Bracket}}` 代码，智能处理 `bestof` 和种族展示。

## 快速开始

### 1. 环境准备
- Node.js (建议 v16+)
- Python 3.x
- 安装依赖：
  ```bash
  pnpm install
  pip install sc2reader
  ```

### 2. 配置
在 `config.js` 中填入你的：
- `API_KEY`: Challonge API Key。
- `SUB_DOMAIN`: Challonge 组织子域名（如有）。

### 3. 运行
```bash
node main.js
```
访问 `http://localhost:3000` 即可开始使用。

## 使用流程

1. **选择比赛**：在下拉菜单中选择最新的 Challonge 锦标赛。
2. **处理录像**：输入或选取包含 `.SC2Replay` 的文件夹，点击 **"Process & Load"**。
3. **映射玩家**：系统会自动匹配大部分玩家，手动调整后点击 **"Save Player Mappings"**。
4. **自动关联**：保存玩家映射后，系统会自动将所有录像填入对应的对阵框中。
5. **生成结果**：点击 **"Analyze & Generate Everything"**，拷贝生成的维基脚本。

## 项目结构

- `main.js`: Express 后端服务。
- `replayreader.py`: Python 录像解析核心。
- `lib/`: 包含逻辑处理模块（Challonge API 交互及维基生成）。
- `public/`: 前端界面（HTML/JS/CSS）。
- `mappings.json`: 存储玩家 ID 对应关系。
- `.cache/`: 存储解析后的中间 JSON 数据。
