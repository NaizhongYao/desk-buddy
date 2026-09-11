@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [Desk Buddy] 找不到 Node.js。请先在这台老师电脑安装 Node.js LTS，然后再双击本文件。
  pause
  exit /b 1
)

start "Desk Buddy 教师烧录台" /min cmd /c "npm run serve"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:4173/?teacher=1"

echo 教师烧录台已经在浏览器中打开。
echo 请保持最小化的 Desk Buddy 教师烧录台窗口运行，课程结束后可以关闭它。
timeout /t 4 /nobreak >nul
