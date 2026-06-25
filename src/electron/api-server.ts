// ──────────────────────────────────────────────────────────────
// OpenClawHelper — 生产环境 API 服务器
// 在 Electron 主进程中启动 HTTP 服务器，提供：
//   1. dist/ 静态文件服务
//   2. /api/openclaw/* 路由（通过调用 openclaw CLI 实现）
// ──────────────────────────────────────────────────────────────

import http, { type IncomingMessage, type ServerResponse } from "http";
import fs from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, readdirSync, statSync, renameSync, copyFileSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname, join, extname } from "path";
import { fileURLToPath } from "url";
import os from "os";
import { execFileDecoded } from "../shared/execFileDecoded.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 找到项目根目录 (main.js 在 dist-electron/electron/electron/)
const APP_ROOT = join(__dirname, "../../..");

// ─── MIME 映射 ──────────────────────────────────────────────────
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

// ─── 工具函数 ────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function error(res: ServerResponse, msg: string, status = 500) {
  if (res.headersSent) return;
  json(res, { error: msg }, status);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ─── OpenClaw 查找 ───────────────────────────────────────────────

const POSSIBLE_OPENCLAW_PATHS = [
  join(os.homedir(), ".npm-global/bin/openclaw"),
  join(os.homedir(), ".local/bin/openclaw"),
  "/usr/local/bin/openclaw",
  "/usr/bin/openclaw",
];

function findOpenClaw(): string {
  for (const p of POSSIBLE_OPENCLAW_PATHS) {
    if (existsSync(p)) return p;
  }
  return "openclaw";
}

async function runOpenClaw(args: string[], timeout = 15000, env?: Record<string, string>) {
  const bin = findOpenClaw();
  const opts = { timeout, maxBuffer: 1024 * 1024 } as Record<string, unknown>;
  if (env) opts.env = { ...process.env, ...env };
  return execFileDecoded(bin, args, opts);
}

// ─── State 目录 ──────────────────────────────────────────────────

function getStateDir(): string {
  return process.env.OPENCLAW_STATE_DIR || join(os.homedir(), ".openclaw");
}

function getConfigPath(): string {
  return process.env.OPENCLAW_CONFIG_PATH || join(getStateDir(), "openclaw.json");
}

function getDefaultAgentId(): string {
  try {
    const cfg = JSON.parse(readFileSync(getConfigPath(), "utf-8"));
    const list = cfg.agents?.list;
    if (Array.isArray(list) && list.length > 0) {
      return (list[0] as Record<string, unknown>).id as string || "main";
    }
  } catch {
    /* ignore */
  }
  return "main";
}

function getDefaultWorkspace(): string {
  return join(os.homedir(), ".openclaw", "workspace");
}

function getAgentWorkspace(agentId: string, explicitWorkspace?: string): string {
  if (explicitWorkspace) return explicitWorkspace;
  if (agentId === "main") return getDefaultWorkspace();
  return join(getStateDir(), `workspace-${agentId}`);
}

// ─── Helper: 从 stdout 提取 PID ──────────────────────────────────

function extractPid(output: string): number | null {
  // 匹配 "PID: 12345" 或 "pid=12345" 或 JSON 中的 pid 字段
  const m = output.match(/[Pp][Ii][Dd][:=]\s*(\d+)/);
  if (m) return parseInt(m[1], 10);
  try {
    const obj = JSON.parse(output);
    if (typeof obj.pid === "number") return obj.pid;
  } catch {
    /* ignore */
  }
  return null;
}

// ─── Helper: 会话文件元信息 ─────────────────────────────────────

interface SessionMeta {
  hasMessages: boolean;
  title: string;
}

/**
 * 读取会话文件头部，返回是否包含对话消息 & 第一个用户消息作为标题。
 * 一次读取避免重复 IO。
 */
function getSessionMeta(filePath: string): SessionMeta {
  const result: SessionMeta = { hasMessages: false, title: '' };
  try {
    const fd = fs.openSync(filePath, 'r');
    // 读取前 48KB —— 第一个用户消息通常不会超过这个值
    const buf = Buffer.alloc(49152);
    const n = fs.readSync(fd, buf, 0, 49152, 0);
    fs.closeSync(fd);
    const head = buf.toString('utf-8', 0, n);

    result.hasMessages =
      head.includes('"role":"user"') || head.includes('"role":"assistant"');

    // 提取第一个用户消息内容作为标题
    if (result.hasMessages) {
      for (const line of head.split('\n')) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'message' && obj.message?.role === 'user') {
            result.title = extractTitle(obj.message.content);
            if (result.title) break;
          }
        } catch { /* skip unparseable lines */ }
      }
    }
  } catch { /* ignore */ }
  return result;
}

/** 从 message.content 中提取可读文本作为标题 */
function extractTitle(content: unknown): string {
  let text = '';
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        text = parsed
          .filter((b: any) => b.type === 'text' && b.text)
          .map((b: any) => b.text)
          .join(' ');
      } else if (typeof parsed === 'object' && parsed.text) {
        text = String(parsed.text);
      }
    } catch {
      text = content; // 纯字符串
    }
  } else if (Array.isArray(content)) {
    text = content
      .filter((b: any) => b.type === 'text' && b.text)
      .map((b: any) => b.text)
      .join(' ');
  } else if (content && typeof content === 'object') {
    text = String((content as any).text || '');
  }

  text = text.trim();
  // 截短到 60 字，保留完整语义边界（标点或空格）
  if (text.length > 60) {
    const truncated = text.slice(0, 60);
    const lastGood = Math.max(
      truncated.lastIndexOf('，'),
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf(' '),
      truncated.lastIndexOf(','),
      truncated.lastIndexOf('？'),
      50
    );
    return (lastGood > 50 ? truncated.slice(0, lastGood + 1) : truncated) + '…';
  }
  return text;
}

// ─── 路由处理 ────────────────────────────────────────────────────

interface RouteHandler {
  method: "GET" | "POST" | "PUT" | "ALL";
  handler: (url: URL, req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

function createRouter(): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>();

  // ── Status ────────────────────────────────────────────────────
  routes.set("status", {
    method: "GET",
    handler: async (_url, _req, res) => {
      try {
        const result = await runOpenClaw(["gateway", "status"], 8000);
        const running = !result.stderr?.includes("not running") && !result.stderr?.includes("not found");

        let version = "unknown";
        try {
          const v = await runOpenClaw(["--version"], 5000);
          version = v.stdout.trim().split("\n")[0] || version;
        } catch {
          /* ignore */
        }

        let nodeVersion = "unknown";
        try {
          const { execFileDecoded: exec } = await import("../shared/execFileDecoded.js");
          const nv = await exec("/usr/local/bin/node", ["--version"], { timeout: 3000 });
          nodeVersion = nv.stdout.trim();
        } catch {
          /* ignore */
        }

        json(res, {
          running,
          raw: result.stdout + result.stderr,
          version,
          nodeVersion,
          stateDir: getStateDir(),
          configPath: getConfigPath(),
          pid: running ? extractPid(result.stdout) : null,
        });
      } catch (err: unknown) {
        json(res, {
          running: false,
          error: (err as Error).message,
          version: "unknown",
          nodeVersion: "unknown",
          stateDir: getStateDir(),
          configPath: getConfigPath(),
          pid: null,
        });
      }
    },
  });

  // ── Version ───────────────────────────────────────────────────
  routes.set("version", {
    method: "GET",
    handler: async (_url, _req, res) => {
      let openclawVer = "unknown";
      try {
        const r = await runOpenClaw(["--version"], 5000);
        openclawVer = r.stdout.trim().split("\n")[0] || openclawVer;
      } catch {
        /* ignore */
      }

      let nodeVer = "unknown";
      try {
        const { execFileDecoded: exec } = await import("../shared/execFileDecoded.js");
        const nv = await exec("/usr/local/bin/node", ["--version"], { timeout: 3000 });
        nodeVer = nv.stdout.trim();
      } catch {
        /* ignore */
      }

      json(res, { openclaw: openclawVer, node: nodeVer });
    },
  });

  // ── Config (GET + PUT) ────────────────────────────────────────
  routes.set("config", {
    method: "ALL",
    handler: async (_url, req, res) => {
      if (req.method === "GET") {
        const configPath = getConfigPath();
        try {
          const content = await readFile(configPath, "utf-8");
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(content);
          } catch {
            /* keep null */
          }
          json(res, { path: configPath, content, parsed, exists: true });
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            json(res, { path: configPath, content: "", parsed: null, exists: false });
          } else {
            error(res, `读取配置失败: ${(err as Error).message}`);
          }
        }
      } else if (req.method === "PUT") {
        const configPath = getConfigPath();
        const body = await readBody(req);
        const { content } = JSON.parse(body);

        try {
          JSON.parse(content);
        } catch {
          error(res, "JSON 格式无效", 400);
          return;
        }

        if (existsSync(configPath)) {
          const bakPath = configPath + `.bak.${Date.now()}`;
          copyFileSync(configPath, bakPath);
        }

        await writeFile(configPath, content, "utf-8");
        json(res, { ok: true, path: configPath });
      } else {
        error(res, `不支持的 HTTP 方法: ${req.method}`);
      }
    },
  });

  // ── Workspace: files ──────────────────────────────────────────
  routes.set("workspace/files", {
    method: "GET",
    handler: async (url, _req, res) => {
      const workspace = url.searchParams.get("workspace") || getDefaultWorkspace();
      const files: Array<{ name: string; path: string; size: number; exists: boolean }> = [];

      const expectedFiles = [
        "AGENTS.md", "SOUL.md", "TOOLS.md",
        "IDENTITY.md", "USER.md", "MEMORY.md",
      ];

      for (const name of expectedFiles) {
        const fp = join(workspace, name);
        files.push({
          name,
          path: fp,
          size: existsSync(fp) ? statSync(fp).size : 0,
          exists: existsSync(fp),
        });
      }

      const memoryDir = join(workspace, "memory");
      const memoryFiles: string[] = [];
      if (existsSync(memoryDir)) {
        for (const f of readdirSync(memoryDir).sort().reverse().slice(0, 30)) {
          if (f.endsWith(".md")) memoryFiles.push(f);
        }
      }

      const memoryFileInfo: Array<{ name: string; path: string; size: number; exists: boolean }> = [];
      for (const name of memoryFiles) {
        const fp = join(memoryDir, name);
        memoryFileInfo.push({
          name,
          path: fp,
          size: existsSync(fp) ? statSync(fp).size : 0,
          exists: existsSync(fp),
        });
      }

      json(res, { workspace, files, memoryFiles: memoryFileInfo });
    },
  });

  // ── Workspace: read file ──────────────────────────────────────
  routes.set("workspace/read", {
    method: "GET",
    handler: async (url, _req, res) => {
      const filePath = url.searchParams.get("path") || "";
      if (!filePath) {
        error(res, "缺少 path 参数", 400);
        return;
      }
      if (filePath.includes("..")) {
        error(res, "路径不合法", 400);
        return;
      }

      try {
        const content = await readFile(filePath, "utf-8");
        const stats = statSync(filePath);
        json(res, { content, size: stats.size, path: filePath });
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          json(res, { content: "", size: 0, path: filePath, exists: false });
        } else {
          error(res, `读取失败: ${(err as Error).message}`);
        }
      }
    },
  });

  // ── Workspace: write file ─────────────────────────────────────
  routes.set("workspace/write", {
    method: "PUT",
    handler: async (_url, req, res) => {
      const body = await readBody(req);
      const { path: filePath, content } = JSON.parse(body);
      if (!filePath) {
        error(res, "缺少 path", 400);
        return;
      }

      if (existsSync(filePath)) {
        const bakPath = filePath + ".bak";
        copyFileSync(filePath, bakPath);
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      json(res, { ok: true, path: filePath });
    },
  });

  // ── Sessions: list ────────────────────────────────────────────
  routes.set("sessions", {
    method: "GET",
    handler: async (url, _req, res) => {
      const agentId = url.searchParams.get("agentId") || getDefaultAgentId();
      const sessionsDir = join(getStateDir(), "agents", agentId, "sessions");
      const sessions: Array<{ key: string; fileSizeBytes: number; lastModified: number; hasMessages?: boolean; title?: string }> = [];

      if (existsSync(sessionsDir)) {
        const entries = readdirSync(sessionsDir)
          .filter((f) => f.endsWith(".jsonl") && !f.includes(".trajectory."))
          .sort((a, b) => {
            const sa = statSync(join(sessionsDir, a));
            const sb = statSync(join(sessionsDir, b));
            return sb.mtimeMs - sa.mtimeMs;
          })
          .slice(0, 500);

        for (const f of entries) {
          const fp = join(sessionsDir, f);
          const stats = statSync(fp);
          const meta = getSessionMeta(fp);
          sessions.push({
            key: f.replace(".jsonl", ""),
            fileSizeBytes: stats.size,
            lastModified: stats.mtimeMs,
            hasMessages: meta.hasMessages,
            title: meta.title,
          });
        }
      }

      json(res, { sessions, agentId, cachedAt: Date.now() });
    },
  });

  routes.set("sessions/scan", {
    method: "GET",
    handler: async (url, _req, res) => {
      // Same as sessions but always refresh
      const agentId = url.searchParams.get("agentId") || getDefaultAgentId();
      const sessionsDir = join(getStateDir(), "agents", agentId, "sessions");
      const sessions: Array<{ key: string; fileSizeBytes: number; lastModified: number; hasMessages?: boolean; title?: string }> = [];

      if (existsSync(sessionsDir)) {
        const entries = readdirSync(sessionsDir)
          .filter((f) => f.endsWith(".jsonl") && !f.includes(".trajectory."))
          .sort((a, b) => {
            const sa = statSync(join(sessionsDir, a));
            const sb = statSync(join(sessionsDir, b));
            return sb.mtimeMs - sa.mtimeMs;
          })
          .slice(0, 500);

        for (const f of entries) {
          const fp = join(sessionsDir, f);
          const stats = statSync(fp);
          const meta = getSessionMeta(fp);
          sessions.push({
            key: f.replace(".jsonl", ""),
            fileSizeBytes: stats.size,
            lastModified: stats.mtimeMs,
            hasMessages: meta.hasMessages,
            title: meta.title,
          });
        }
      }

      json(res, { sessions, agentId, cachedAt: Date.now() });
    },
  });

  // ── Sessions: archived ────────────────────────────────────────
  routes.set("sessions/archived", {
    method: "GET",
    handler: async (url, _req, res) => {
      const agentId = url.searchParams.get("agentId") || getDefaultAgentId();
      const sessionsDir = join(getStateDir(), "agents", agentId, "sessions");
      const sessions: Array<{
        key: string;
        originalSessionId: string;
        compactedAt: string;
        fileSizeBytes: number;
        lastModified: number;
        hasMessages?: boolean;
        title?: string;
      }> = [];

      if (existsSync(sessionsDir)) {
        readdirSync(sessionsDir)
          .filter((f) => f.includes(".jsonl.reset.") || f.includes(".jsonl.deleted."))
          .sort((a, b) => {
            const sa = statSync(join(sessionsDir, a));
            const sb = statSync(join(sessionsDir, b));
            return sb.mtimeMs - sa.mtimeMs;
          })
          .slice(0, 500)
          .forEach((f) => {
            const fp = join(sessionsDir, f);
            const stats = statSync(fp);
            const match = f.match(/^([0-9a-f-]+)\.jsonl\.reset\.(.+)$/);
            const meta = getSessionMeta(fp);
            sessions.push({
              key: f,
              originalSessionId: match ? match[1] : f,
              compactedAt: match ? match[2].replace(/\.\d+Z$/, "Z") : "",
              fileSizeBytes: stats.size,
              lastModified: stats.mtimeMs,
              hasMessages: meta.hasMessages,
              title: meta.title,
            });
          });
      }

      json(res, { sessions, agentId, cachedAt: Date.now() });
    },
  });

  // ── Sessions: read ────────────────────────────────────────────
  routes.set("sessions/read", {
    method: "POST",
    handler: async (_url, req, res) => {
      const body = await readBody(req);
      const params = JSON.parse(body);
      let { path: sessionPath, limit = 20, offsetLine, startLine, agentId, key } = params;

      if (!sessionPath && agentId && key) {
        if (key.includes(".reset.") || key.includes(".deleted.")) {
          sessionPath = join(getStateDir(), "agents", agentId, "sessions", key);
        } else {
          sessionPath = join(getStateDir(), "agents", agentId, "sessions", `${key}.jsonl`);
        }
      }

      if (!sessionPath || (!sessionPath.endsWith(".jsonl") && !sessionPath.includes(".reset.") && !sessionPath.includes(".deleted."))) {
        error(res, "不合法路径: 需要 path 或 agentId+key", 400);
        return;
      }
      if (!existsSync(sessionPath)) {
        error(res, `文件不存在: ${sessionPath}`, 404);
        return;
      }

      const content = await readFile(sessionPath, "utf-8");
      const allLines = content.split("\n").filter((l) => l.trim());
      const totalLines = allLines.length;
      const maxLimit = 500;
      const actualLimit = Math.min(Math.max(1, limit), maxLimit);

      let start = 0;
      if (startLine !== undefined && startLine >= 0) {
        start = startLine;
      } else if (offsetLine !== undefined && offsetLine >= 0) {
        start = Math.max(0, offsetLine - actualLimit);
      } else {
        start = Math.max(0, totalLines - actualLimit);
      }

      const end = Math.min(start + actualLimit, totalLines);
      const lines = allLines.slice(start, end);

      json(res, {
        lines,
        totalLines,
        startLine: start,
        endLine: end,
        hasMore: start > 0,
      });
    },
  });

  // ── Sessions: usage ───────────────────────────────────────────
  routes.set("sessions/usage", {
    method: "GET",
    handler: async (url, _req, res) => {
      const agentId = url.searchParams.get("agentId") || undefined;
      try {
        const args = ["sessions", "list", "--json"];
        if (agentId) {
          args.push("--agent", agentId);
        } else {
          args.push("--all-agents");
        }
        // Request all sessions (cap at 500)
        args.push("--limit", "500");

        const result = await runOpenClaw(args, 30000);
        if (result.code !== 0 && !result.stdout) {
          json(res, { sessions: [], totals: null });
          return;
        }

        const parsed = JSON.parse(result.stdout);
        const rawSessions = parsed.sessions || [];

        const entries: Array<Record<string, unknown>> = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalTokens = 0;
        let totalCostUsd = 0;
        let totalRuntimeMs = 0;
        let totalCacheRead = 0;
        let totalCacheWrite = 0;
        let sessionWithTokens = 0;
        const models = new Set<string>();
        const channels = new Set<string>();

        for (const s of rawSessions) {
          const inputTokens = s.inputTokens || 0;
          const outputTokens = s.outputTokens || 0;
          const tokTotal = s.totalTokens || 0;
          const model = s.modelOverride || s.model || "unknown";
          const channel = s.kind === "direct" ? "direct" : (s.kind || "unknown");

          models.add(model);
          channels.add(channel);

          // Estimate cost (rough: $2/M input, $8/M output for most models)
          const estimatedCost = (inputTokens / 1_000_000) * 2 + (outputTokens / 1_000_000) * 8;
          totalInputTokens += inputTokens;
          totalOutputTokens += outputTokens;
          totalTokens += tokTotal;
          totalCostUsd += estimatedCost;
          totalRuntimeMs += s.ageMs || 0;
          if (tokTotal > 0) sessionWithTokens++;

          entries.push({
            key: s.key || "",
            model,
            channel,
            inputTokens,
            outputTokens,
            totalTokens: tokTotal,
            estimatedCostUsd: estimatedCost,
            runtimeMs: s.ageMs || 0,
            status: s.totalTokensFresh ? "done" : "stale",
            startedAt: s.updatedAt ? s.updatedAt - (s.ageMs || 0) : 0,
            endedAt: s.updatedAt || 0,
            label: s.sessionId ? s.sessionId.slice(0, 8) : "",
            cacheRead: 0,
            cacheWrite: 0,
            messageCount: 0,
            compactionCount: 0,
            thinkingLevel: "",
            chatType: s.kind || "",
            parentSessionKey: null,
            spawnDepth: s.kind === "direct" ? 0 : 1,
          });
        }

        json(res, {
          sessions: entries,
          totals: {
            totalSessions: rawSessions.length,
            sessionWithTokens,
            totalInputTokens,
            totalOutputTokens,
            totalTokens,
            totalCostUsd,
            totalRuntimeMs,
            models: Array.from(models),
            channels: Array.from(channels),
            totalCacheRead,
            totalCacheWrite,
          },
        });
      } catch (err: unknown) {
        json(res, {
          sessions: [],
          totals: null,
          error: (err as Error).message,
        });
      }
    },
  });

  // ── Sessions: delete ──────────────────────────────────────────
  routes.set("sessions/delete", {
    method: "POST",
    handler: async (_url, req, res) => {
      const body = await readBody(req);
      const { path: sessionPath } = JSON.parse(body);
      if (!sessionPath || !sessionPath.endsWith(".jsonl")) {
        error(res, "不合法路径", 400);
        return;
      }
      if (existsSync(sessionPath)) {
        const trashPath = sessionPath + ".deleted." + Date.now();
        renameSync(sessionPath, trashPath);
        json(res, { ok: true, deleted: sessionPath, backup: trashPath });
      } else {
        error(res, "文件不存在", 404);
      }
    },
  });

  // ── Action ────────────────────────────────────────────────────
  routes.set("action", {
    method: "POST",
    handler: async (_url, req, res) => {
      const body = await readBody(req);
      const { command, args } = JSON.parse(body);

      if (command !== "openclaw") {
        error(res, "只允许执行 openclaw 命令", 403);
        return;
      }

      const result = await runOpenClaw(args, 30000);
      json(res, {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
      });
    },
  });

  // ── Update: status ────────────────────────────────────────────
  routes.set("update/status", {
    method: "GET",
    handler: async (_url, _req, res) => {
      try {
        const result = await runOpenClaw(["update", "status", "--json"], 15000);
        const data = JSON.parse(result.stdout);
        json(res, data);
      } catch (err: unknown) {
        json(res, {
          error: "解析更新状态失败",
          message: (err as Error).message,
        });
      }
    },
  });

  // ── Update: run ───────────────────────────────────────────────
  routes.set("update/run", {
    method: "POST",
    handler: async (_url, _req, res) => {
      if (updateState.running) {
        json(res, { status: "running", message: "更新正在进行中，请稍候...", running: true });
        return;
      }

      const npmPrefix = join(os.homedir(), ".npm-global");
      updateState = {
        running: true,
        output: "",
        code: null,
        startedAt: Date.now(),
        finishedAt: null,
      };

      // Run update in background and track result
      runOpenClaw(["update", "--yes"], 180000, { npm_config_prefix: npmPrefix })
        .then((result) => {
          updateState.running = false;
          updateState.output = (result.stdout || "") + (result.stderr || "");
          updateState.code = result.code;
          updateState.finishedAt = Date.now();
        })
        .catch((err: Error) => {
          updateState.running = false;
          updateState.output = `更新进程异常: ${err.message}`;
          updateState.code = -1;
          updateState.finishedAt = Date.now();
        });

      json(res, { status: "started", message: "正在更新 OpenClaw，请等待..." });
    },
  });

  // ── Update: result ────────────────────────────────────────────
  routes.set("update/result", {
    method: "GET",
    handler: async (_url, _req, res) => {
      json(res, updateState);
    },
  });

  // ── Update: log ───────────────────────────────────────────────
  routes.set("update/log", {
    method: "GET",
    handler: async (_url, _req, res) => {
      const logPath = join(getStateDir(), "update.log");
      try {
        const content = await readFile(logPath, "utf-8");
        json(res, { content, exists: true });
      } catch {
        json(res, { content: "", exists: false });
      }
    },
  });

  // ── Doctor (gateway status as markdown) ───────────────────────
  routes.set("doctor", {
    method: "POST",
    handler: async (_url, _req, res) => {
      try {
        const result = await runOpenClaw(["gateway", "status"], 8000);
        json(res, { stdout: result.stdout + result.stderr });
      } catch (err: unknown) {
        json(res, { stdout: `❌ 诊断失败: ${(err as Error).message}` });
      }
    },
  });

  // ── Agents ────────────────────────────────────────────────────
  routes.set("agents", {
    method: "GET",
    handler: async (_url, _req, res) => {
      try {
        // Try to read agent config from openclaw config file
        const configPath = getConfigPath();
        let agents: Array<{ id: string; workspace: string; model: string | { primary?: string; fallbacks?: string[] }; enabled: boolean }> = [];

        if (existsSync(configPath)) {
          const raw = readFileSync(configPath, "utf-8");
          const cfg = JSON.parse(raw);
          const list = cfg.agents?.list;
          if (Array.isArray(list)) {
            agents = list.map((a: Record<string, unknown>) => ({
              id: (a.id as string) || "unknown",
              workspace: getAgentWorkspace((a.id as string) || "main", a.workspace as string | undefined),
              model: (a.model as string | { primary?: string; fallbacks?: string[] }) || "unknown",
              enabled: a.enabled !== false,
            }));
          }
        }

        if (agents.length === 0) {
          agents = [{
            id: "main",
            workspace: getDefaultWorkspace(),
            model: "default",
            enabled: true,
          }];
        }

        json(res, { agents });
      } catch (err: unknown) {
        json(res, { agents: [], error: (err as Error).message });
      }
    },
  });

  // ── Channels ──────────────────────────────────────────────────
  routes.set("channels", {
    method: "GET",
    handler: async (_url, _req, res) => {
      // 所有已知内置渠道的完整列表
      const allBuiltin: Array<{ name: string; displayName: string }> = [
        { name: "webchat", displayName: "WebChat" },
        { name: "telegram", displayName: "Telegram" },
        { name: "signal", displayName: "Signal" },
        { name: "discord", displayName: "Discord" },
        { name: "slack", displayName: "Slack" },
        { name: "whatsapp", displayName: "WhatsApp" },
        { name: "irc", displayName: "IRC" },
        { name: "feishu", displayName: "飞书" },
        { name: "openclaw-weixin", displayName: "OpenClaw 微信" },
        { name: "googlechat", displayName: "Google Chat" },
        { name: "line", displayName: "LINE" },
        { name: "matrix", displayName: "Matrix" },
        { name: "mattermost", displayName: "Mattermost" },
        { name: "msteams", displayName: "Microsoft Teams" },
        { name: "nextcloud-talk", displayName: "Nextcloud Talk" },
        { name: "nostr", displayName: "Nostr" },
        { name: "qqbot", displayName: "QQ Bot" },
        { name: "synology-chat", displayName: "Synology Chat" },
        { name: "tlon", displayName: "Tlon" },
        { name: "twitch", displayName: "Twitch" },
        { name: "voicecall", displayName: "Voice Call" },
        { name: "zalo", displayName: "Zalo" },
        { name: "imessage", displayName: "iMessage" },
        { name: "clickclack", displayName: "ClickClack" },
        { name: "zalouser", displayName: "Zalo User" },
        { name: "sms", displayName: "SMS" },
      ];

      const channels: Array<{
        name: string;
        displayName: string;
        type: "builtin" | "plugin" | "external";
        enabled: boolean;
        configured: boolean;
        config: Record<string, unknown>;
      }> = [];

      try {
        const configPath = getConfigPath();
        let entries: Record<string, unknown> | undefined;
        if (existsSync(configPath)) {
          const raw = readFileSync(configPath, "utf-8");
          const cfg = JSON.parse(raw);
          entries = cfg.channels as Record<string, unknown> | undefined;
        }

        // 遍历所有内置渠道
        for (const info of allBuiltin) {
          const v = entries?.[info.name] as Record<string, unknown> | undefined;
          const configured = v !== undefined && v !== null && Object.keys(v).length > 0;
          channels.push({
            name: info.name,
            displayName: info.displayName,
            type: "builtin",
            enabled: v ? (v as Record<string, unknown>).enabled !== false : false,
            configured,
            config: (v || {}) as Record<string, unknown>,
          });
        }

        // 插件 / 外部渠道（不在内置列表中的）
        if (entries) {
          for (const [key, val] of Object.entries(entries)) {
            const name = key.replace(/^channels\./, "");
            if (allBuiltin.some((b) => b.name === name)) continue; // 已在内置列表
            const v = val as Record<string, unknown>;
            channels.push({
              name,
              displayName: name,
              type: "plugin",
              enabled: v.enabled !== false,
              configured: v !== null && Object.keys(v).length > 0,
              config: v || {},
            });
          }
        }
      } catch {
        /* ignore */
      }

      json(res, { channels });
    },
  });

  // ── Channels: update config ───────────────────────────────────
  routes.set("channels/config", {
    method: "POST",
    handler: async (_url, req, res) => {
      const body = JSON.parse(await readBody(req));
      const { name, config } = body as { name: string; config: Record<string, unknown> };

      if (!name) {
        error(res, "缺少 name", 400);
        return;
      }

      try {
        const configPath = getConfigPath();
        const raw = readFileSync(configPath, "utf-8");
        const cfg = JSON.parse(raw);

        // 备份
        const bakPath = configPath + `.bak.${Date.now()}`;
        copyFileSync(configPath, bakPath);

        if (!cfg.channels) cfg.channels = {};
        cfg.channels[name] = { ...(cfg.channels[name] as Record<string, unknown> || {}), ...config };

        await writeFile(configPath, JSON.stringify(cfg, null, 2), "utf-8");
        json(res, { ok: true });
      } catch (err: unknown) {
        error(res, `更新配置失败: ${(err as Error).message}`);
      }
    },
  });

  // ── Channels: delete ─────────────────────────────────────────
  routes.set("channels/delete", {
    method: "POST",
    handler: async (_url, req, res) => {
      const body = JSON.parse(await readBody(req));
      const { name } = body as { name: string };

      if (!name) {
        error(res, "缺少 name", 400);
        return;
      }

      try {
        const configPath = getConfigPath();
        const raw = readFileSync(configPath, "utf-8");
        const cfg = JSON.parse(raw);

        if (cfg.channels?.[name]) {
          const bakPath = configPath + `.bak.${Date.now()}`;
          copyFileSync(configPath, bakPath);
          delete cfg.channels[name];
          await writeFile(configPath, JSON.stringify(cfg, null, 2), "utf-8");
        }

        json(res, { ok: true });
      } catch (err: unknown) {
        error(res, `删除配置失败: ${(err as Error).message}`);
      }
    },
  });

  return routes;
}

// ─── 静态文件服务 ──────────────────────────────────────────────

function serveStatic(url: URL, res: ServerResponse, distDir: string) {
  let filePath = join(distDir, url.pathname === "/" ? "index.html" : url.pathname);

  if (!existsSync(filePath)) {
    // SPA fallback
    filePath = join(distDir, "index.html");
  }

  if (!existsSync(filePath)) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const stats = statSync(filePath);

  res.statusCode = 200;
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", stats.size);
  res.setHeader("Cache-Control", "no-cache");

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on("error", () => {
    res.statusCode = 500;
    res.end("Internal Server Error");
  });
}

// ─── Update 状态跟踪 ──────────────────────────────────────────

let updateState: {
  running: boolean;
  output: string;
  code: number | null;
  startedAt: number;
  finishedAt: number | null;
} = {
  running: false,
  output: "",
  code: null,
  startedAt: 0,
  finishedAt: null,
};

// ─── 启动 API 服务器 ──────────────────────────────────────────

const API_BASE = "/api/openclaw/";

function parseRoute(pathname: string): string | null {
  if (!pathname.startsWith(API_BASE)) return null;
  const route = pathname.slice(API_BASE.length).replace(/\/$/, "");
  return route || null;
}

export function startApiServer(distDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const router = createRouter();

    function tryListen(attempt: number) {
      const port = 18789 + attempt;
      const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
        // CORS
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        const url = new URL(req.url || "/", `http://localhost:${port}`);
        const route = parseRoute(url.pathname);

        if (route) {
          const handler = router.get(route);
          if (!handler) {
            error(res, `未知路由: ${route}`, 404);
            return;
          }

          if (handler.method !== "ALL" && handler.method !== req.method) {
            error(res, `方法不允许: ${req.method} (期望 ${handler.method})`, 405);
            return;
          }

          handler.handler(url, req, res).catch((err: Error) => {
            console.error(`[API Error] ${route}:`, err);
            error(res, err.message || "内部错误");
          });
        } else {
          serveStatic(url, res, distDir);
        }
      });

      server.listen(port, "127.0.0.1", () => {
        console.log(`[API Server] Listening on http://127.0.0.1:${port}`);
        resolve(port);
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && attempt < 10) {
          console.warn(`[API Server] Port ${port} in use, trying ${port + 1}...`);
          tryListen(attempt + 1);
        } else {
          reject(err);
        }
      });
    }

    tryListen(0);
  });
}
