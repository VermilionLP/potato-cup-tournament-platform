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
  echo 请填写 site（网站地址）和 adminToken（管理员令牌），需要切 OBS 的再填 obs 开头的几项，然后保存并关闭记事本。
  notepad config.json
)

echo.
echo 回车 = 沿用上次的值。停止：关闭本窗口或按 Ctrl+C。
echo.
node wt-autoscene.mjs --config config.json --ask
echo.
echo 程序已退出。
pause
