@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 战争雷霆自动切换直播画面

rem Node.js 22 or newer
where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js。请安装 Node.js 22 或更新版本（LTS），装好后重新双击本文件。
  start "" https://nodejs.org/
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo 当前 Node.js 版本太旧，需要 22 或更新版本。
  start "" https://nodejs.org/
  pause
  exit /b 1
)

rem First run: make config.json and open it
if not exist config.json (
  copy /y config.example.json config.json >nul
  echo 第一次使用：已创建 config.json，正在用记事本打开。
  echo 请填写 obsPassword（OBS WebSocket 密码），并把 obsBattle / obsEnded / obsHangar 改成你 OBS 里的场景名，然后保存并关闭记事本。
  echo 只切 OBS 场景时，site 和 adminToken 留空即可。
  notepad config.json
)

echo.
echo 停止：关闭本窗口或按 Ctrl+C。
echo.
node wt-autoscene.mjs --config config.json --ask
echo.
echo 程序已退出。
pause
