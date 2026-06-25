#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# OpenClawHelper — 一键运行脚本 (Ubuntu / Linux)
# ──────────────────────────────────────────────────────────────
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "━━━ OpenClawHelper 启动 ━━━"
echo ""

# 1. 确保依赖已安装
if [ ! -d "node_modules" ]; then
  echo "▸ 安装依赖…"
  npm install
  echo ""
fi

# 2. 先编译 Electron 后端
echo "▸ 编译 Electron 后端…"
npx tsc -p tsconfig.electron.json
echo ""

# 3. 清理旧进程
echo "▸ 清理旧进程…"
pkill -f "node.*vite" 2>/dev/null || true
pkill -f "electron.*openclaw-helper\|electron.*Helper" 2>/dev/null || true
sleep 2
echo "   旧进程已清理"
echo ""

# 4. 启动 Vite 开发服务器
echo "▸ 启动 Vite 开发服务器 (端口 5173)…"
nohup npx vite --host 127.0.0.1 --port 5173 > /tmp/vite-dev.log 2>&1 &
VITE_PID=$!
echo "   Vite PID: $VITE_PID"

# 5. 等待 Vite 就绪（最多 15s）
echo "▸ 等待 Vite 就绪…"
for i in $(seq 1 15); do
  if curl -s -o /dev/null http://127.0.0.1:5173/ 2>/dev/null; then
    echo "   Vite 就绪 ($((i))s)"
    break
  fi
  sleep 1
done

# 6. 清理 Electron 旧日志
: > /tmp/electron-helper.log

# 7. 启动 Electron
echo "▸ 启动 Electron…"
echo ""
echo "━━━ 应用已启动 ━━━"
echo "   日志: /tmp/electron-helper.log"
echo "   Vite: http://127.0.0.1:5173"
echo ""
VITE_DEV_SERVER_URL=http://127.0.0.1:5173 npx electron .
