#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# OpenClawHelper — 本机编译 Windows 构建包
# 在当前 Linux 机器上交叉编译为 Windows x64 可分发应用
# ──────────────────────────────────────────────────────────────
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "━━━ OpenClawHelper 构建 (Windows x64) ━━━"
echo "  工作目录: $ROOT"
echo ""

# 1. 安装依赖
if [ ! -d "node_modules" ]; then
  echo "▸ 安装依赖…"
  npm install
  echo ""
fi

# 2. 编译前端 + 后端
echo "▸ 编译前端 (Vite)…"
npx vite build
echo ""

echo "▸ 编译 Electron 后端 (TypeScript)…"
npx tsc -p tsconfig.electron.json
echo ""

# 3. 打包 Windows 分发版
echo "▸ 打包为 Windows x64 应用…"
npx electron-packager . openclaw-helper \
  --platform=win32 \
  --arch=x64 \
  --out=release \
  --overwrite \
  --prune=true \
  --ignore=release \
  --ignore=node_modules/electron-packager
echo ""

# 4. 输出
OUTDIR="$(ls -d release/openclaw-helper-win32-x64 2>/dev/null || echo '')"
if [ -n "$OUTDIR" ]; then
  echo "━━━ 构建完成 ━━━"
  echo "  输出目录: $ROOT/$OUTDIR"
  du -sh "$OUTDIR" 2>/dev/null || true
fi
echo ""
echo "运行方式:  将 $OUTDIR 复制到 Windows 机器并运行 openclaw-helper.exe"
