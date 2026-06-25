# OpenClawHelper 🦞

> OpenClaw 自托管 AI Gateway 桌面管理工具

基于 Electron + Vue 3 + TypeScript 构建的桌面应用，提供 OpenClaw Gateway 的本地管理界面。

## 功能

### 📊 仪表板
- Gateway 状态总览（运行状态、版本、连接数）
- 渠道概况统计（总计 / 已配置 / 已启用）
- Agent 运行状态一览
- 已配置渠道快速查看

### 💬 会话管理
- 浏览所有会话，支持搜索和标题展示
- 查看已归档（compacted）会话
- 仅显示有实际对话的会话
- 删除会话

### 📡 渠道管理
- 展示所有内置/插件渠道列表
- 已配置 / 未配置分类显示
- 编辑渠道配置（JSON）
- 启用 / 禁用渠道
- 删除渠道配置

### ⚙️ 配置管理
- 可视化编辑 Gateway 配置文件
- 自动备份，避免误操作
- 一键切换配置

### 🖥️ 终端（TUI）
- 内嵌 xterm 终端，直接操作 Gateway CLI
- 支持 OpenClaw 命令交互

### 📝 笔记 & 知识库
- 工作区笔记管理
- 飞书知识库集成

### 📈 用量统计
- 会话使用量统计
- Agent 调用数据

### 🧩 技能管理
- 查看已安装技能
- 浏览技能详情

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Vue 3 + Composition API |
| 状态管理 | Pinia |
| 构建工具 | Vite 6 |
| 桌面框架 | Electron 35 |
| 终端组件 | xterm.js |
| 后端 | Node.js (Electron 主进程) |
| 语言 | TypeScript |

## 快速开始

### 前置要求

- Node.js >= 20
- 已安装 OpenClaw Gateway

### 安装

```bash
git clone https://github.com/rethshen/openclaw-helper.git
cd openclaw-helper
npm install
```

### 开发模式

```bash
npm run dev
```

启动后自动打开 Electron 窗口，连接本地 OpenClaw Gateway。

### 构建

```bash
# Linux
npm run package:linux

# Windows
npm run package:win
```

构建产物输出到 `release/` 目录。

## 项目结构

```
src/
├── electron/          # Electron 主进程（后端 API + IPC）
│   ├── main.ts        # 入口
│   ├── preload.ts     # 预加载脚本
│   └── api-server.ts  # HTTP API 服务（会话/配置/渠道等）
├── renderer/          # 渲染进程（Vue 前端）
│   ├── App.vue
│   ├── main.ts
│   ├── api/           # API 客户端
│   ├── components/    # 通用组件
│   ├── pages/         # 页面组件
│   ├── stores/        # Pinia 状态管理
│   └── styles/        # 全局样式
└── shared/            # 主进程与渲染进程共享代码
```

## 配置

应用连接本地 OpenClaw Gateway 配置文件（默认路径: `~/.openclaw/openclaw.json`），无需额外配置即可访问。

## FAQ

**Q: 为什么需要这个工具？**  
A: OpenClaw Gateway 本身无图形界面，管理会话、查看日志、编辑配置需要命令行操作。这个工具提供了直观的桌面 UI。

**Q: 支持远程连接吗？**  
A: 目前只支持本地 Gateway。远程连接功能规划中。

**Q: 是否可以在没有 OpenClaw 的环境下运行？**  
A: 可以启动，但大部分功能依赖本地 Gateway 服务。

## License

MIT
