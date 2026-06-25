@echo off
REM ──────────────────────────────────────────────────────────────
REM OpenClawHelper — 一键运行脚本 (Windows)
REM ──────────────────────────────────────────────────────────────
cd /d "%~dp0.."
set ROOT=%CD%

echo === OpenClawHelper 启动 ===
echo.

REM 1. 确保依赖已安装
if not exist "node_modules" (
  echo ^> 安装依赖...
  call npm install
  echo.
)

REM 2. 先编译 Electron 后端
echo ^> 编译 Electron 后端...
call npx tsc -p tsconfig.electron.json
echo.

REM 3. 清理旧进程
echo ^> 清理旧进程...
taskkill /f /im node.exe 2>nul
taskkill /f /im electron.exe 2>nul
timeout /t 2 /nobreak >nul
echo    旧进程已清理
echo.

REM 4. 启动 Vite 开发服务器
echo ^> 启动 Vite 开发服务器 (端口 5173)...
start "Vite" cmd /c "npx vite --host 127.0.0.1 --port 5173"
echo.

REM 5. 等待 Vite 就绪（最多 20s）
echo ^> 等待 Vite 就绪...
set /a counter=0
:wait_loop
timeout /t 1 /nobreak >nul
set /a counter+=1
>nul curl -s http://127.0.0.1:5173/ && goto vite_ready
if %counter% geq 20 (
  echo [!] Vite 启动超时，请检查端口 5173
  pause
  exit /b 1
)
goto wait_loop
:vite_ready
echo    Vite 就绪 (%counter%s)

REM 6. 启动 Electron
echo.
echo === 应用已启动 ===
echo    Vite: http://127.0.0.1:5173
echo.
call npx electron .
