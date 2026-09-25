@echo off
REM 角色包出包工具 — 独立进程，不启动桌宠
cd /d "%~dp0app"
if not exist "node_modules\electron\dist\electron.exe" (
  echo 请先在 app 目录执行 npm install
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" packer\main.js
