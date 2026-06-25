#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# OpenClawHelper — 本机一键编译所有平台构建包
# 在当前 Linux 机器上依次编译 Linux + Windows 的可分发应用
# ──────────────────────────────────────────────────────────────
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "━━━ OpenClawHelper 全平台构建 ━━━"
echo "  工作目录: $ROOT"
echo ""

# 1. 安装依赖
if [ ! -d "node_modules" ]; then
  echo "▸ 安装依赖…"
  npm install
  echo ""
fi

# 2. 编译前端 + 后端（只做一次）
echo "▸ 编译前端 (Vite)…"
npx vite build
echo ""

echo "▸ 编译 Electron 后端 (TypeScript)…"
npx tsc -p tsconfig.electron.json
echo ""

# 3. 依次打包各平台
echo "▸ [1/2] 打包 Linux x64 …"
npx electron-packager . openclaw-helper \
  --platform=linux \
  --arch=x64 \
  --out=release \
  --overwrite \
  --prune=true \
  --ignore=release \
  --ignore=node_modules/electron-packager
echo "  ✓ Linux 构建完成"
echo ""

echo "▸ [2/2] 打包 Windows x64 …"
npx electron-packager . openclaw-helper \
  --platform=win32 \
  --arch=x64 \
  --out=release \
  --overwrite \
  --prune=true \
  --ignore=release \
  --ignore=node_modules/electron-packager
echo "  ✓ Windows 构建完成"
echo ""

# 4. 输出汇总
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  全平台构建完成"
echo ""
for d in "$ROOT"/release/openclaw-helper-*; do
  if [ -d "$d" ]; then
    echo "  • $(basename "$d")"
    du -sh "$d" 2>/dev/null | awk '{print "    Size: " $1}'
  fi
done
echo ""
echo "  Linux 运行:  release/openclaw-helper-linux-x64/openclaw-helper"
echo "  Windows 运行: 将 release/openclaw-helper-win32-x64 复制到 Windows 机器"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
