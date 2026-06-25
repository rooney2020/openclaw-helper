# OpenClawHelper — 功能规格书 v0.1

> 一个基于 Electron + React + TypeScript 的桌面管理工具，用于协助管理和使用 OpenClaw 自托管 AI Gateway。

---

## 目录

1. [技术选型](#1-技术选型)
2. [页面架构](#2-页面架构)
3. [功能模块详解](#3-功能模块详解)
4. [API / IPC 设计](#4-api--ipc-设计)
5. [数据模型](#5-数据模型)
6. [UI 设计原则](#6-ui-设计原则)
7. [安全边界](#7-安全边界)
8. [发布与打包](#8-发布与打包)

---

## 1. 技术选型

| 层 | 技术 | 选型理由 |
|---|---|---|
| UI 框架 | **React 19** + TypeScript | 与 adbHelper 一致，社区成熟 |
| 桌面壳 | **Electron 35+** | 跨平台桌面应用，直接调用系统命令 |
| 构建 | **Vite 7** | HMR 快，Electron 集成友好 |
| 样式 | **CSS / Catppuccin Mocha** | 与 OpenClaw 风格一致，避免额外依赖 |
| 状态管理 | React Context + hooks | 足够简单，不需要 Redux/Zustand |
| 后端 IPC | Vite middleware（同 adbHelper） | 统一在 dev server 中处理，无需额外通信层 |
| 图标 | Iconify（内联 SVG） | 保持一致的高质量图标，禁止 emoji 作为 UI 图标 |

**架构图：**

```
┌─────────────────────────────────────────────────────┐
│  Electron Main Process                               │
│  ┌───────────────────────────────────────────────┐  │
│  │  main.ts                                        │  │
│  │  · BrowserWindow 管理                            │  │
│  │  · 系统命令执行 (exec)                            │  │
│  │  · 文件 I/O (read/write)                         │  │
│  │  · 进程守护管理 (spawn/kill)                      │  │
│  └───────────────────────────────────────────────┘  │
│                              ▲                       │
│                              │ IPC (Vite middleware)  │
│                              ▼                       │
│  ┌───────────────────────────────────────────────┐  │
│  │  Renderer Process (React)                      │  │
│  │  · App.tsx - 路由 + 布局                        │  │
│  │  · pages/   - 功能页面                          │  │
│  │  · components/ - 可复用组件                      │  │
│  │  · lib/     - API + 工具函数                     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 2. 页面架构

### 侧边栏导航

```
┌───────────────────────────┐
│  🦞 OpenClawHelper  v0.1 │  ← 顶栏
├───────────────────────────┤
│  📊 仪表板                 │  ← 侧边导航
│  ──────────────────────── │
│  🧠 智能体管理              │
│  ✏️ 文件编辑               │
│  ⚙️ 配置编辑               │
│  💬 会话管理               │
│  ──────────────────────── │
│  📡 渠道状态               │
│  📋 日志监控               │
│  🔧 工具集                 │
│  ──────────────────────── │
│  ⚡ 一键操作               │
└───────────────────────────┘
```

### 路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 仪表板 | Gateway 状态总览 |
| `/agents` | 智能体管理 | 多智能体列表 & 切换 |
| `/editor` | 文件编辑 | 工作区文件编辑器 |
| `/config` | 配置编辑 | openclaw.json 可视化编辑 |
| `/sessions` | 会话管理 | 会话列表 & 操作 |
| `/channels` | 渠道状态 | 各渠道连接状态 |
| `/logs` | 日志监控 | Gateway 实时日志 |
| `/tools` | 工具集 | 杂项快捷操作 |
| `/actions` | 一键操作 | 重启/开关机等快捷按钮 |

---

## 3. 功能模块详解

### 3.1 📊 仪表板 (`/`)

**目标：** Gateway 状态一目了然。

- **运行状态卡片：**
  - Gateway 是否运行（绿灯/红灯）
  - 运行时长（uptime）
  - PID、端口（默认 18789）
  - Node.js 版本（`/usr/local/bin/node --version`）
  - OpenClaw 版本（`openclaw --version`）
- **快速统计：**
  - 已连接的渠道数
  - 活跃会话数
  - 智能体数量
  - 今日消息数（按会话 JSONL 统计）
- **健康检查按钮：** 一键执行 `openclaw gateway status`
- **最近事件：** 显示最近 10 条 cron/heartbeat/agent 事件

### 3.2 🧠 智能体管理 (`/agents`)

**目标：** 多智能体的创建、选择、删除。

- **智能体列表：** 读取 `~/.openclaw/openclaw.json` 中 `agents.list`，显示每个智能体的 ID、workspace、model、status
- **智能体详情：**
  - workspace 路径
  - 使用的模型
  - 绑定渠道
  - 会话数统计
- **操作：**
  - 切换默认智能体
  - 添加/删除智能体（写入配置）
  - 查看/编辑每个智能体的引导文件

### 3.3 ✏️ 文件编辑 (`/editor`)

**目标：** 直接在 App 中编辑 OpenClaw 工作区核心文件。

**支持的文件列表：**

| 文件 | 路径（默认） | 说明 |
|---|---|---|
| AGENTS.md | `~/.openclaw/workspace/AGENTS.md` | 操作说明 + 记忆 |
| SOUL.md | `~/.openclaw/workspace/SOUL.md` | 人设边界 |
| MEMORY.md | `~/.openclaw/workspace/MEMORY.md` | 长期记忆 |
| TOOLS.md | `~/.openclaw/workspace/TOOLS.md` | 工具说明 |
| IDENTITY.md | `~/.openclaw/workspace/IDENTITY.md` | 身份定义 |
| USER.md | `~/.openclaw/workspace/USER.md` | 用户档案 |

**功能：**
- 文件树显示 + 标签页切换
- 语法高亮（Markdown / JSON5）
- 保存前自动备份（`文件.md.bak`）
- "缺失文件"检测（比对标准文件列表）
- 模板创建：一键生成缺失文件的默认模板
- 文件大小和行数显示
- 会话摘要查看：`memory/YYYY-MM-DD.md` 列表

### 3.4 ⚙️ 配置编辑 (`/config`)

**目标：** 可视化编辑 `~/.openclaw/openclaw.json`。

- **JSON 视图：** 代码编辑器（Monaco 或 CodeMirror），JSON5 语法高亮 + 校验
- **表单项视图（未来）：** 按配置拓扑渲染表单字段
  - `agents.defaults.workspace`
  - `agents.defaults.model.*`
  - `channels.*` 各渠道配置
  - `messages.queue.*`
  - `tools.*`
- **配置校验：** 保存前检查 JSON 合法性
- **备份管理：** 自动备份历史版本（`openclaw.json.bak.1` 等）

### 3.5 💬 会话管理 (`/sessions`)

**目标：** 浏览和操作用于智能体管理的会话。

> 注意：此处的"会话管理"指管理 OpenClaw 智能体的会话（而非本应用的设置）。

- **会话列表：**
  - 读取 `~/.openclaw/agents/<agentId>/sessions/*.jsonl`
  - 显示：会话 KEY、agentId、渠道、消息数、token 数、最后活跃时间
  - 搜索/筛选（按 agentId、渠道、日期范围）
- **会话详情：**
  - 按时间线展示消息内容（简化的只读视图）
  - 显示压缩记录次数
  - 显示 token 使用量
- **操作：**
  - 手动压缩会话
  - 删除会话（确认弹窗 + 备份）
  - 导出会话为 Markdown

### 3.6 📡 渠道状态 (`/channels`)

**目标：** 查看各渠道的连接与配置状态。

- **渠道卡片列表：**
  - 内置渠道：Telegram、WhatsApp、Discord、Signal、Slack、iMessage、WebChat、IRC
  - 插件渠道：Feishu、LINE、Matrix、Teams 等
- **每卡片显示：**
  - 启用/禁用状态
  - 认证状态（已配置 API key / 未配置）
  - `allowFrom` 列表摘要
  - 最近活跃时间
  - 流式传输/分块配置

### 3.7 📋 日志监控 (`/logs`)

**目标：** 实时查看 OpenClaw Gateway 日志。

- **日志源：** `openclaw gateway status` 获取进程日志，或直接读取 `journalctl` / systemd 日志
- **功能：**
  - 实时 tail（类似 `openclaw --verbose`）
  - 搜索/过滤（error、warn、info 级别）
  - 日志导出
  - 自动滚动 / 暂停

### 3.8 🔧 工具集 (`/tools`)

**目标：** 集成 OpenClaw CLI 的快捷操作。

| 工具 | CLI 命令 | 说明 |
|---|---|---|
| Gateway 状态 | `openclaw gateway status` | 查运行状态 |
| Doctor 诊断 | `openclaw doctor` | 全面健康检查 |
| 查看工作区 | `openclaw setup --status` | 工作区状态 |
| 仪表板 URL | `openclaw dashboard` | 打开 Control UI |
| 包列表 | `openclaw plugins list` | 查看已安装插件 |
| 模型测试 | `openclaw models list` | 查看可用模型 |
| 环境检查 | `openclaw --version` | 版本信息 |
| 会话大小 | `du -sh ~/.openclaw/agents/*/sessions/` | 磁盘占用 |
| 配置文件路径 | `openclaw config get agents.defaults.workspace` | 查当前工作区 |

### 3.9 ⚡ 一键操作 (`/actions`)

**目标：** 常用操作按钮面板。

| 按钮 | 执行 | 确认弹窗 |
|---|---|---|
| 🔄 重启 Gateway | `openclaw gateway restart` | 是 |
| 🟢 启动 Gateway | `openclaw gateway start` | 否 |
| 🔴 停止 Gateway | `openclaw gateway stop` | 是 |
| 🩺 运行诊断 | `openclaw doctor` | 否 |
| 🌐 打开仪表板 | `openclaw dashboard` | 否 |
| 🗑️ 清理旧会话 | 扫描并提示删除 N 天前会话 | 是 |
| 💾 备份工作区 | `cp -r ~/.openclaw ~/.openclaw.bak.$(date +%Y%m%d_%H%M%S)` | 否 |

---

## 4. API / IPC 设计

采用 adbHelper 模式：在 Vite dev server 中嵌入中间件，所有 API 路径以 `/api/openclaw/` 开头。

### 端点一览

| 端点 | 方法 | 返回 | 说明 |
|---|---|---|---|
| `/api/openclaw/status` | GET | `{ running, pid, uptime, port, version }` | Gateway 运行状态 |
| `/api/openclaw/config` | GET | `object` | 读取 `openclaw.json` |
| `/api/openclaw/config` | PUT | `{ ok }` | 写入 `openclaw.json` |
| `/api/openclaw/config/schema` | GET | `object` | 通过 `config.schema.lookup` 获取架构 |
| `/api/openclaw/workspace/files` | GET | `[{ name, path, size, exists }]` | 工作区文件列表 |
| `/api/openclaw/workspace/read` | GET | `{ content }` | 读取指定文件 |
| `/api/openclaw/workspace/write` | PUT | `{ ok }` | 写入指定文件 |
| `/api/openclaw/workspace/backup` | POST | `{ path }` | 备份文件 |
| `/api/openclaw/sessions` | GET | `[{ key, agentId, channel, msgCount, lastActive }]` | 会话列表 |
| `/api/openclaw/sessions/:key` | GET | `{ messages, compactions, tokens }` | 会话详情 |
| `/api/openclaw/sessions/:key` | DELETE | `{ ok }` | 删除会话 |
| `/api/openclaw/agents` | GET | `[{ id, workspace, model }]` | 智能体列表 |
| `/api/openclaw/channels` | GET | `[{ name, enabled, configured }]` | 渠道状态 |
| `/api/openclaw/logs` | GET (SSE) | 实时日志流 | 通过 exec tail / journalctl |
| `/api/openclaw/action` | POST | `{ stdout, stderr, code }` | 执行任意 openclaw CLI 命令 |
| `/api/openclaw/version` | GET | `{ node, openclaw }` | 版本信息 |
| `/api/openclaw/doctor` | POST | `{ stdout }` | 运行 openclaw doctor |

### 执行模式

```typescript
// 同步命令（快速返回）
execFile("openclaw", ["gateway", "status"], { timeout: 5000 })

// 流式命令（日志持续输出）
const child = spawn("openclaw", ["--verbose"], { ... })
child.stdout.on("data", (chunk) => {
  // SSE 推送给前端
})
```

---

## 5. 数据模型

### Gateway Status

```typescript
interface GatewayStatus {
  running: boolean;
  pid: number | null;
  uptime: number;   // seconds, 0 if not running
  port: number;     // default 18789
  version: string;  // openclaw --version output
  nodeVersion: string;
  configPath: string;
  stateDir: string;
}
```

### Session Info

```typescript
interface SessionInfo {
  key: string;
  agentId: string;
  kind: "main" | "group" | "cron" | "hook" | "node";
  channel?: string;
  messageCount: number;
  tokenEstimate: number;
  compactionCount: number;
  createdAt: number;    // unix ms
  lastActiveAt: number; // unix ms
  fileSizeBytes: number;
}
```

### Agent Info

```typescript
interface AgentInfo {
  id: string;
  workspace: string;
  model: string;
  provider: string;
  enabled: boolean;
  sessionCount: number;
  channelBindings: string[];
}
```

### Channel Info

```typescript
interface ChannelInfo {
  name: string;
  displayName: string;
  type: "builtin" | "plugin" | "external";
  enabled: boolean;
  configured: boolean;  // has credentials
  allowFrom: string[];
  lastActive?: number;
  connectionStatus: "connected" | "disconnected" | "error" | "unknown";
}
```

---

## 6. UI 设计原则

### 主题

- **Catppuccin Mocha** — 与 OpenClaw 文档风格一致
- 深色背景，暖色点缀（peach / mauve / sky）
- 禁止 emoji 作为 UI 图标 → 全部使用 Iconify 内联 SVG

### 布局

```
┌──────────────────────────────────────────────────┐
│  🦞 OpenClawHelper  v0.1        [⚙️ 设置] [💡]   │  ← 顶栏 (44px)
├──────────┬───────────────────────────────────────┤
│          │                                       │
│  导航栏    │         主内容区                       │
│          │                                       │
│  (56px)  │    (路由页面)                          │
│          │                                       │
│          │                                       │
├──────────┴───────────────────────────────────────┤
│  Status: 🟢 Gateway 运行中  |  端口 18789  |  v2026.4  │  ← 状态栏
└──────────────────────────────────────────────────┘
```

### 设计规范

| 项目 | 值 |
|---|---|
| 侧边栏宽度 | 56px（仅图标）或 200px（图标+文字）— 可折叠 |
| 字体 | `-apple-system, 'PingFang SC', sans-serif` |
| 等宽字体 | `'JetBrains Mono', 'Fira Code', monospace` |
| 圆角 | 8px（卡片）/ 6px（按钮）/ 4px（小元素） |
| 动效 | 150ms ease 过渡 |
| 最大宽度 | 主内容区自适应，最大 1200px |

---

## 7. 安全边界

### 文件访问

- **只读路径白名单**：`~/.openclaw/`、`~/.openclaw/agents/*/sessions/`、`~/.openclaw/workspace/`
- **写入路径白名单**：`~/.openclaw/workspace/*.md`、`~/.openclaw/openclaw.json`
- 禁止访问：私有密钥文件（`auth-profiles.json`、`auth.json`）

### 命令执行

- **允许的命令前缀**：`openclaw`、`node`（仅 --version）
- 禁止任意 shell 注入
- 所有用户确认操作（重启/停止/删除）要有二次确认弹窗

### 配置文件

- 写入配置前做 JSON 校验，防止损坏配置文件
- 写入前自动备份

---

## 8. 发布与打包

| 平台 | 命令 | 输出 |
|---|---|---|
| Linux | `npm run package:linux` | `release/openclaw-helper-linux-x64/` |
| Windows | `npm run package:win` | `release/openclaw-helper-win32-x64/` |

打包工具：**electron-packager**（同 adbHelper）

---

## 附录：开发路线

### Phase 1 — 核心框架（预计 1-2 天）
- [x] 项目脚手架（Vite + Electron + React）
- [x] IPC 中间件框架（Vite middleware）
- [x] 布局组件（侧边栏 + 顶栏 + 状态栏）
- [x] Catppuccin Mocha 主题
- [ ] 仪表板页面（Gateway 状态卡片）

### Phase 2 — 管理功能（预计 2-3 天）
- [ ] 文件编辑器（AGENTS.md / SOUL.md / MEMORY.md 等）
- [ ] 配置编辑器（openclaw.json）
- [ ] 智能体管理
- [ ] 会话浏览

### Phase 3 — 监控与操作（预计 1-2 天）
- [ ] 渠道状态页
- [ ] 实时日志监控
- [ ] 一键操作面板
- [ ] 健康检查 / 诊断

### Phase 4 — 打磨（预计 1 天）
- [ ] 错误处理与边界情况
- [ ] 打包测试
- [ ] README 与文档
