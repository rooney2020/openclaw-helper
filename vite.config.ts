import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { execFile, execFileSync, spawn, type ChildProcess } from "child_process";
import { execFileDecoded } from "./src/shared/execFileDecoded.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, readdirSync, statSync, renameSync, copyFileSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "fs";
import { dirname, join, basename, extname } from "path";
import os from "os";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { createRequire } from "module";
const ocRequire = createRequire(import.meta.url);
const pty: typeof import("@lydell/node-pty") = ocRequire("@lydell/node-pty");

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = execFileDecoded;

// ─── Constants ─────────────────────────────────────────────────────────────────
// Priority: user's npm-global (most current) → system paths → which fallback
const POSSIBLE_OPENCLAW_PATHS = [
  join(os.homedir(), ".npm-global/bin/openclaw"),
  join(os.homedir(), ".local/bin/openclaw"),
  "/usr/local/bin/openclaw",
  "/usr/bin/openclaw",
];

// ─── State ─────────────────────────────────────────────────────────────────────
let logProcess: ChildProcess | null = null;
let logClients: Set<ServerResponse> = new Set();

// ─── TUI Terminal ───────────────────────────────────────────────────────────────
let tuiWsClients: Set<WebSocket> = new Set();
let tuiPty: IPty | null = null;
let tuiPid: number | null = null;

function findOpenClaw(): string {
  for (const p of POSSIBLE_OPENCLAW_PATHS) {
    if (existsSync(p)) return p;
  }
  // Try which
  try {
    const { execSync } = ocRequire("child_process");
    const out = execSync("which openclaw", { encoding: "utf-8" }).trim();
    if (out) return out;
  } catch {}
  return "openclaw";
}

function startTuiPty(): IPty | null {
  if (tuiPty) return tuiPty;
  try {
    const openclawPath = findOpenClaw();
    const tuiArgs = ["tui", "--local"];
    const shellEnv = { ...process.env, TERM: "xterm-256color", FORCE_COLOR: "1" };
    tuiPty = pty.spawn(openclawPath, tuiArgs, {
      name: "xterm-256color",
      cols: 100,
      rows: 30,
      cwd: os.homedir(),
      env: shellEnv,
    });
    tuiPid = tuiPty.pid;

    tuiPty.onData((data: string) => {
      for (const ws of tuiWsClients) {
        try { ws.send(data); } catch {}
      }
    });

    tuiPty.onExit(({ exitCode, signal }) => {
      const reason = signal ? `信号 ${signal}` : `退出码 ${exitCode}`;
      tuiPty = null;
      tuiPid = null;
      for (const ws of tuiWsClients) {
        try { ws.send(`\r\n\x1b[33m[TUI 进程已退出: ${reason}]\x1b[0m\r\n`); } catch {}
      }
    });

    return tuiPty;
  } catch (err) {
    console.error("[TUI] Failed to start PTY:", err);
    return null;
  }
}

function restartTuiPty(): boolean {
  stopTuiPty();
  const p = startTuiPty();
  return p !== null;
}

function resizeTuiPty(cols: number, rows: number) {
  if (tuiPty) {
    try { tuiPty.resize(cols, rows); } catch {}
  }
}

function stopTuiPty() {
  if (tuiPty) {
    try { tuiPty.kill(); } catch {}
    tuiPty = null;
    tuiPid = null;
  }
}

// ─── Session Cache ──────────────────────────────────────────────────────────────
const SESSION_CACHE_DIR = join(os.homedir(), ".config/openclaw-helper/session-cache");

interface SessionCacheEntry {
  key: string;
  agentId: string;
  fileSizeBytes: number;
  lastModified: number;
  hasMessages: boolean;
  messageCount: number;
  cachedAt: number;
}

interface SessionIndex {
  sessions: SessionCacheEntry[];
  lastScanAt: number;
}

interface SessionUsageEntry {
  key: string;
  model: string;
  channel: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  runtimeMs: number;
  status: string;
  startedAt: number;
  endedAt: number;
  label: string;
  cacheRead: number;
  cacheWrite: number;
  messageCount: number;
  compactionCount: number;
  thinkingLevel: string;
  chatType: string;
  parentSessionKey?: string;
  spawnDepth: number;
}

interface SessionUsageTotals {
  totalSessions: number;
  sessionWithTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  totalRuntimeMs: number;
  models: string[];
  channels: string[];
  totalCacheRead?: number;
  totalCacheWrite?: number;
}

function getSessionCacheDir(agentId: string): string {
  return join(SESSION_CACHE_DIR, agentId);
}

function getSessionIndexPath(agentId: string): string {
  return join(getSessionCacheDir(agentId), "index.json");
}

function loadSessionIndex(agentId: string): SessionIndex {
  const idxPath = getSessionIndexPath(agentId);
  try {
    const raw = readFileSync(idxPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { sessions: [], lastScanAt: 0 };
  }
}

function saveSessionIndex(agentId: string, idx: SessionIndex): void {
  const dir = getSessionCacheDir(agentId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(getSessionIndexPath(agentId), JSON.stringify(idx, null, 2), "utf-8");
}

function hasUserOrAssistantMessages(filePath: string): { hasMessages: boolean; count: number } {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    let count = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        // v3: { role: "user"|"assistant", content: ... }
        // v1: { type: "message", message: { role: ... } }
        const role =
          parsed.message?.role ||
          (parsed.type === "message" ? parsed.message?.role : null) ||
          parsed.role;
        if (role === "user" || role === "assistant") {
          count++;
        }
      } catch { /* skip unparseable lines */ }
    }
    return { hasMessages: count > 0, count };
  } catch {
    return { hasMessages: false, count: 0 };
  }
}

function scanSessions(agentId: string): SessionIndex {
  const sessionsDir = join(getStateDir(), "agents", agentId, "sessions");
  const existing = loadSessionIndex(agentId);
  const cacheMap = new Map<string, SessionCacheEntry>();
  for (const s of existing.sessions) {
    cacheMap.set(s.key, s);
  }

  const scanned: SessionCacheEntry[] = [];
  let changed = false;

  if (existsSync(sessionsDir)) {
    const entries = readdirSync(sessionsDir)
      .filter(f => f.endsWith(".jsonl"))
      .sort((a, b) => {
        const sa = statSync(join(sessionsDir, a));
        const sb = statSync(join(sessionsDir, b));
        return sb.mtimeMs - sa.mtimeMs;
      });

    const limit = 500; // cap at 500 sessions

    for (const f of entries) {
      const fp = join(sessionsDir, f);
      const stats = statSync(fp);
      const key = f.replace(".jsonl", "");
      const cached = cacheMap.get(key);

      // Cache hit: file unchanged
      if (cached && cached.lastModified === stats.mtimeMs && cached.fileSizeBytes === stats.size) {
        scanned.push(cached);
        continue;
      }

      // New or changed: parse
      const { hasMessages, count } = hasUserOrAssistantMessages(fp);
      const entry: SessionCacheEntry = {
        key,
        agentId,
        fileSizeBytes: stats.size,
        lastModified: stats.mtimeMs,
        hasMessages,
        messageCount: count,
        cachedAt: Date.now(),
      };
      scanned.push(entry);
      changed = true;

      if (scanned.length >= limit) break;
    }
  }

  const idx: SessionIndex = {
    sessions: scanned,
    lastScanAt: Date.now(),
  };

  if (changed || scanned.length !== existing.sessions.length) {
    saveSessionIndex(agentId, idx);
  }

  return idx;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

async function findOpenClawAsync(): Promise<string> {
  return findOpenClaw();
}

async function runOpenClaw(args: string[], timeout = 15000) {
  const bin = await findOpenClawAsync();
  return execFileAsync(bin, args, { timeout, maxBuffer: 1024 * 1024 });
}

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
  } catch { /* ignore */ }
  return "main";
}

function getDefaultWorkspace(): string {
  return join(os.homedir(), ".openclaw", "workspace");
}

function getAgentWorkspace(agentId: string, explicitWorkspace?: string): string {
  if (explicitWorkspace) return explicitWorkspace;
  // Main agent uses the global workspace directory
  if (agentId === "main") return getDefaultWorkspace();
  // Other agents without explicit workspace get workspace-{agentId}
  return join(getStateDir(), `workspace-${agentId}`);
}

// ─── API Routes ────────────────────────────────────────────────────────────────

interface RouteHandler {
  method: "GET" | "POST" | "PUT" | "DELETE";
  handler: (url: URL, req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

/** Match frontend extractBlocks: only text and thinking blocks contribute visible text */
function extractVisibleText(content: any[]): string {
  const parts: string[] = [];
  for (const item of content) {
    if (item.type === "text" && item.text) {
      parts.push(item.text);
    } else if (item.type === "thinking" && item.thinking) {
      parts.push(item.thinking);
    }
  }
  return parts.join("\n\n");
}

function createRouter(): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>();

  // ── Status ──────────────────────────────────────────────────────────────────
  routes.set("status", {
    method: "GET",
    handler: async (_url, _req, res) => {
      const result = await runOpenClaw(["gateway", "status"], 8000);
      const running = !result.stderr?.includes("not running") && !result.stderr?.includes("not found");

      // Parse version
      let version = "unknown";
      try {
        const v = await runOpenClaw(["--version"], 5000);
        version = v.stdout.trim().split("\n")[0] || version;
      } catch { /* ignore */ }

      let nodeVersion = "unknown";
      try {
        const nv = await execFileAsync("/usr/local/bin/node", ["--version"], { timeout: 3000 });
        nodeVersion = nv.stdout.trim();
      } catch { /* ignore */ }

      json(res, {
        running,
        raw: result.stdout + result.stderr,
        version,
        nodeVersion,
        stateDir: getStateDir(),
        configPath: getConfigPath(),
        pid: running ? extractPid(result.stdout) : null,
      });
    },
  });

  // ── Version ─────────────────────────────────────────────────────────────────
  routes.set("version", {
    method: "GET",
    handler: async (_url, _req, res) => {
      let openclawVer = "unknown";
      try {
        const r = await runOpenClaw(["--version"], 5000);
        openclawVer = r.stdout.trim().split("\n")[0] || openclawVer;
      } catch { /* ignore */ }

      let nodeVer = "unknown";
      try {
        const nv = await execFileAsync("/usr/local/bin/node", ["--version"], { timeout: 3000 });
        nodeVer = nv.stdout.trim();
      } catch { /* ignore */ }

      json(res, { openclaw: openclawVer, node: nodeVer });
    },
  });

  // ── Config: read ────────────────────────────────────────────────────────────
  routes.set("config", {
    method: "ALL",
    handler: async (_url, req, res) => {
      const configPath = getConfigPath();

      if (req.method === "GET") {
        try {
          const content = await readFile(configPath, "utf-8");
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(content);
          } catch {
            // If JSON parse fails, return as raw string
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
        const body = await readBody(req);
        const { content } = JSON.parse(body);

        // Validate JSON before writing
        try {
          JSON.parse(content);
        } catch {
          error(res, "JSON 格式无效", 400);
          return;
        }

        // Backup existing
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

  // ── Workspace: file listing ─────────────────────────────────────────────────
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
        const exists = existsSync(fp);
        files.push({
          name,
          path: fp,
          size: exists ? statSync(fp).size : 0,
          exists,
        });
      }

      // Also list daily notes
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

  // ── Workspace: read file ────────────────────────────────────────────────────
  routes.set("workspace/read", {
    method: "GET",
    handler: async (url, _req, res) => {
      const filePath = url.searchParams.get("path") || "";
      if (!filePath) { error(res, "缺少 path 参数", 400); return; }
      if (filePath.includes("..")) { error(res, "路径不合法", 400); return; }

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

  // ── Workspace: write file ───────────────────────────────────────────────────
  routes.set("workspace/write", {
    method: "PUT",
    handler: async (_url, req, res) => {
      const body = await readBody(req);
      const { path: filePath, content } = JSON.parse(body);
      if (!filePath) { error(res, "缺少 path", 400); return; }

      // Auto-backup
      if (existsSync(filePath)) {
        const bakPath = filePath + ".bak";
        copyFileSync(filePath, bakPath);
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      json(res, { ok: true, path: filePath });
    },
  });

  // ── Sessions: scan (cached) ─────────────────────────────────────────────────
  routes.set("sessions", {
    method: "GET",
    handler: async (url, _req, res) => {
      const agentId = url.searchParams.get("agentId") || getDefaultAgentId();
      let idx = loadSessionIndex(agentId);
      // Auto-scan on first load or if cache is empty
      if (idx.sessions.length === 0) {
        idx = scanSessions(agentId);
      }
      json(res, { sessions: idx.sessions, agentId, cachedAt: idx.lastScanAt });
    },
  });

  routes.set("sessions/scan", {
    method: "GET",
    handler: async (url, _req, res) => {
      const agentId = url.searchParams.get("agentId") || getDefaultAgentId();
      const idx = scanSessions(agentId);
      json(res, { sessions: idx.sessions, agentId, cachedAt: idx.lastScanAt });
    },
  });

  // ── Sessions: delete ────────────────────────────────────────────────────────
  // ── Sessions: read lines (paged) ─────────────────────────────────────────────
  routes.set("sessions/read", {
    method: "POST",
    handler: async (_url, req, res) => {
      const body = await readBody(req);
      const params = JSON.parse(body);

      // Resolve path: accept agentId+key OR direct path
      let { path, limit = 20, offsetLine, startLine, agentId, key } = params;

      if (!path && agentId && key) {
        path = join(getStateDir(), "agents", agentId, "sessions", `${key}.jsonl`);
      }

      if (!path || !path.endsWith(".jsonl")) {
        error(res, "不合法路径: 需要 path 或 agentId+key", 400);
        return;
      }
      if (!existsSync(path)) {
        error(res, `文件不存在: ${path}`, 404);
        return;
      }

      const content = await readFile(path, "utf-8");
      const allLines = content.split("\n").filter((l) => l.trim());
      const totalLines = allLines.length;
      const maxLimit = 500;
      const actualLimit = Math.min(Math.max(1, limit), maxLimit);

      let start;
      if (startLine !== undefined && startLine >= 0) {
        // Load forward from startLine
        start = startLine;
      } else if (offsetLine !== undefined && offsetLine >= 0) {
        // Load backward ending at offsetLine (default old behavior)
        start = Math.max(0, offsetLine - actualLimit);
      } else {
        // Default: load from end
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

  routes.set("sessions/delete", {
    method: "POST",
    handler: async (_url, req, res) => {
      const body = await readBody(req);
      const { path } = JSON.parse(body);
      if (!path || !path.endsWith(".jsonl")) {
        error(res, "不合法路径", 400);
        return;
      }
      if (existsSync(path)) {
        // Move to trash instead of delete
        const trashPath = path + ".deleted." + Date.now();
        renameSync(path, trashPath);
        json(res, { ok: true, deleted: path, backup: trashPath });
      } else {
        error(res, "文件不存在", 404);
      }
    },
  });

  // ── Sessions: search content ────────────────────────────────────────────
  routes.set("sessions/search-content", {
    method: "GET",
    handler: async (url, _req, res) => {
      const query = url.searchParams.get("q") || "";
      const agentId = url.searchParams.get("agentId") || getDefaultAgentId();

      if (!query.trim()) {
        json(res, { results: null });
        return;
      }

      const sessionsDir = join(getStateDir(), "agents", agentId, "sessions");
      if (!existsSync(sessionsDir)) {
        json(res, { results: [] });
        return;
      }

      const q = query.toLowerCase();
      // results is an array of {key, matchCount, lineNumbers}
      const results: Array<{key: string; matchCount: number; lineNumbers: number[]}> = [];
      const files = readdirSync(sessionsDir).filter(f => f.endsWith(".jsonl") && !f.includes(".deleted"));

      for (const f of files) {
        const fp = join(sessionsDir, f);
        try {
          const content = readFileSync(fp, "utf-8");
          const trimmedLines = content.split("\n").filter(l => l.trim());

          const matchLineNumbers: number[] = [];
          for (let ti = 0; ti < trimmedLines.length; ti++) {
            const line = trimmedLines[ti];
            try {
              const parsed = JSON.parse(line);
              // Only search user and assistant messages (matches frontend parseMessage filter)
              let role = "";
              let content: unknown = null;
              if (parsed.type === "message" && parsed.message) {
                role = parsed.message.role || "";
                content = parsed.message.content;
              } else if (parsed.role && parsed.content) {
                role = parsed.role || "";
                content = parsed.content;
              }
              if (role !== "user" && role !== "assistant") continue;

              // Extract visible text the same way the frontend does (extractBlocks)
              let textToSearch = "";
              if (typeof content === "string") {
                try {
                  const parsedArr = JSON.parse(content);
                  if (Array.isArray(parsedArr)) {
                    textToSearch = extractVisibleText(parsedArr);
                  } else {
                    textToSearch = content;
                  }
                } catch {
                  textToSearch = content;
                }
              } else if (Array.isArray(content)) {
                textToSearch = extractVisibleText(content);
              }

              if (textToSearch.toLowerCase().includes(q)) {
                matchLineNumbers.push(ti);
              }
            } catch { /* skip parse errors */ }
          }

          if (matchLineNumbers.length > 0) {
            results.push({
              key: f.replace(".jsonl", ""),
              matchCount: matchLineNumbers.length,
              lineNumbers: matchLineNumbers,
            });
          }
        } catch { /* skip broken files */ }
      }

      json(res, { results });
    },
  });

  // ── Sessions: usage stats ───────────────────────────────────────────────────
  routes.set("sessions/usage", {
    method: "GET",
    handler: async (url, _req, res) => {
      const agentId = url.searchParams.get("agentId") || getDefaultAgentId();
      const usagePath = join(getStateDir(), "agents", agentId, "sessions", "sessions.json");
      if (!existsSync(usagePath)) {
        json(res, { sessions: [], totals: null });
        return;
      }
      try {
        const raw = readFileSync(usagePath, "utf-8");
        const data = JSON.parse(raw);
        // Load cache index for extra metadata (messageCount)
        const cacheIdx = loadSessionIndex(agentId);
        const cacheByKey = new Map<string, SessionCacheEntry>();
        for (const c of cacheIdx.sessions) cacheByKey.set(c.key, c);

        const sessionsList: any[] = [];
        let totalInput = 0, totalOutput = 0, totalCost = 0, totalRuntime = 0;
        let sessionWithTokens = 0;

        for (const [key, s] of Object.entries(data)) {
          const info = s as Record<string, unknown>;
          const input = (info.inputTokens as number) || 0;
          const output = (info.outputTokens as number) || 0;
          const cost = (info.estimatedCostUsd as number) || 0;
          const runtime = (info.runtimeMs as number) || 0;
          if (input > 0 || output > 0) sessionWithTokens++;
          totalInput += input;
          totalOutput += output;
          totalCost += cost;
          totalRuntime += runtime;
          const cacheRead = (info.cacheRead as number) || 0;
          const cacheWrite = (info.cacheWrite as number) || 0;
          // Merge message count from cache index
          const cached = cacheByKey.get(key);
          const messageCount = cached?.messageCount ?? 0;
          sessionsList.push({
            key,
            model: info.model || "—",
            channel: info.lastChannel || "—",
            inputTokens: input,
            outputTokens: output,
            totalTokens: (info.totalTokens as number) || (input + output),
            estimatedCostUsd: cost,
            runtimeMs: runtime,
            status: info.status || "—",
            startedAt: info.startedAt || 0,
            endedAt: info.endedAt || 0,
            label: info.label || (key as string).slice(0, 16),
            cacheRead,
            cacheWrite,
            messageCount,
            compactionCount: (info.compactionCount as number) || 0,
            thinkingLevel: (info.thinkingLevel as string) || "—",
            chatType: (info.chatType as string) || "—",
            parentSessionKey: (info.parentSessionKey as string) || undefined,
            spawnDepth: (info.spawnDepth as number) || 0,
          } satisfies SessionUsageEntry);
        }

        // Sort by startedAt descending
        sessionsList.sort((a, b) => (b.startedAt as number) - (a.startedAt as number));

        const totals: SessionUsageTotals = {
          totalSessions: sessionsList.length,
          sessionWithTokens,
          totalInputTokens: totalInput,
          totalOutputTokens: totalOutput,
          totalTokens: totalInput + totalOutput,
          totalCostUsd: totalCost,
          totalRuntimeMs: totalRuntime,
          models: [...new Set(sessionsList.map((s: any) => s.model).filter(Boolean))],
          channels: [...new Set(sessionsList.map((s: any) => s.channel).filter(Boolean))],
        };

        // Cache totals
        const totalCacheRead = sessionsList.reduce((s: number, x: any) => s + x.cacheRead, 0);
        const totalCacheWrite = sessionsList.reduce((s: number, x: any) => s + x.cacheWrite, 0);
        totals.totalCacheRead = totalCacheRead;
        totals.totalCacheWrite = totalCacheWrite;

        json(res, { sessions: sessionsList, totals });
      } catch (err) {
        json(res, { sessions: [], totals: null, error: String(err) });
      }
    },
  });

  // ── Action: run CLI command ─────────────────────────────────────────────────
  routes.set("action", {
    method: "POST",
    handler: async (_url, req, res) => {
      const body = await readBody(req);
      const { command, args } = JSON.parse(body);

      // Security: only allow openclaw commands
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

  // ── Update status ─────────────────────────────────────────────────────────
  routes.set("update/status", {
    method: "GET",
    handler: async (_url, _req, res) => {
      const result = await runOpenClaw(["update", "status", "--json"], 15000);
      try {
        const data = JSON.parse(result.stdout);
        json(res, data);
      } catch {
        json(res, { error: "解析更新状态失败", stdout: result.stdout, stderr: result.stderr });
      }
    },
  });

  // ── Update run ──────────────────────────────────────────────────────────────
  routes.set("update/run", {
    method: "POST",
    handler: async (_url, _req, res) => {
      // Cannot run `openclaw update` from Vite's process tree — it's a descendant
      // of Gateway, and `openclaw update` walks PPID chain and refuses.
      //
      // Solution: open an external terminal emulator. A new terminal window runs
      // in an independent process tree (gnome-terminal-server), NOT under Gateway.
      const bin = await findOpenClawAsync();

      // Write a self-contained update script to /tmp
      const scriptPath = "/tmp/oc-update-run.sh";
      const scriptContent = [
        "#!/bin/bash",
        "",
        'echo "=== OpenClaw 一键更新 ==="',
        "echo",
        'echo "[1/3] 正在停止 Gateway..."',
        bin + ' gateway stop || true',
        'echo "[2/3] 等待 Gateway 退出..."',
        "sleep 3",
        "echo",
        'echo "[3/3] 正在更新..."',
        bin + " update --yes",
        'EXIT_CODE=$?',
        "echo",
        'if [ $EXIT_CODE -eq 0 ]; then',
        '  echo "=== 更新成功！请关闭此窗口 ==="',
        'else',
        '  echo "=== 更新失败 (code: $EXIT_CODE) ==="',
        "fi",
        'echo "5 秒后自动关闭..."',
        "read -t 5 || true",
      ].join("\n");
      writeFileSync(scriptPath, scriptContent, "utf-8");
      chmodSync(scriptPath, 0o755);

      // Find available terminal emulator
      const terminals: { cmd: string; args: string[] }[] = [
        { cmd: "gnome-terminal", args: ["--", "bash", scriptPath] },
        { cmd: "x-terminal-emulator", args: ["-e", "bash", scriptPath] },
        { cmd: "xterm", args: ["-e", "bash", scriptPath] },
        { cmd: "xfce4-terminal", args: ["-e", "bash", scriptPath] },
        { cmd: "konsole", args: ["-e", "bash", scriptPath] },
        { cmd: "lxterminal", args: ["-e", "bash", scriptPath] },
        { cmd: "alacritty", args: ["-e", "bash", scriptPath] },
        { cmd: "kitty", args: ["-e", "bash", scriptPath] },
      ];

      let terminal: { cmd: string; args: string[] } | undefined;
      for (const t of terminals) {
        if (existsSync(t.cmd)) {
          terminal = t;
          break;
        }
        // Also check via which (execSync)
        try {
          const out = execFileSync("which", [t.cmd], { encoding: "utf-8", stdio: "pipe" }).trim();
          if (out) {
            terminal = t;
            break;
          }
        } catch { /* not found */ }
      }

      if (!terminal) {
        json(res, {
          status: "error",
          message: "未找到可用的终端模拟器，请在外部终端手动执行: " + bin + " update --yes",
        });
        return;
      }

      const child = spawn(terminal.cmd, terminal.args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      json(res, {
        status: "started",
        message: "终端窗口已打开，请按提示完成更新",
        script: scriptPath,
      });
    },
  });

  // ── Update log ──────────────────────────────────────────────────────────────
  routes.set("update/log", {
    method: "GET",
    handler: async (_url, _req, res) => {
      const logPath = "/tmp/oc-update.log";
      if (!existsSync(logPath)) {
        json(res, { content: "", exists: false });
        return;
      }
      try {
        const content = readFileSync(logPath, "utf-8");
        json(res, { content, exists: true });
      } catch {
        json(res, { content: "读取日志失败", exists: true });
      }
    },
  });

  // ── Doctor ──────────────────────────────────────────────────────────────────
  routes.set("doctor", {
    method: "POST",
    handler: async (_url, _req, res) => {
      const result = await runOpenClaw(["doctor"], 30000);
      json(res, {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
      });
    },
  });

  // ── Agents list from config ─────────────────────────────────────────────────
  routes.set("agents", {
    method: "GET",
    handler: async (_url, _req, res) => {
      const configPath = getConfigPath();
      const workspace = getDefaultWorkspace();
      const agents: Array<{
        id: string; workspace: string;
        model: { primary: string; fallbacks: string[] };
        enabled: boolean;
      }> = [];

      try {
        const content = await readFile(configPath, "utf-8");
        const cfg = JSON.parse(content);
        const list = cfg.agents?.list;
        if (Array.isArray(list)) {
          for (const entry of list as Array<Record<string, unknown>>) {
            const rawModel = entry.model || cfg.agents?.defaults?.model;
            let primary = "unknown";
            let fallbacks: string[] = [];
            if (typeof rawModel === "string") {
              primary = rawModel;
            } else if (rawModel && typeof rawModel === "object") {
              const rm = rawModel as Record<string, unknown>;
              primary = (rm.primary as string) || "unknown";
              fallbacks = (rm.fallbacks as string[]) || [];
            }
            const agentId = (entry.id as string) || "main";
            agents.push({
              id: agentId,
              workspace: getAgentWorkspace(agentId, entry.workspace as string | undefined),
              model: { primary, fallbacks },
              enabled: entry.enabled !== false,
            });
          }
        } else if (list && typeof list === "object") {
          for (const [id, agentCfg] of Object.entries(list) as [string, unknown][]) {
            const ac = agentCfg as Record<string, unknown>;
            const rawModel = ac.model || cfg.agents?.defaults?.model;
            let primary = "unknown";
            let fallbacks: string[] = [];
            if (typeof rawModel === "string") {
              primary = rawModel;
            } else if (rawModel && typeof rawModel === "object") {
              const rm = rawModel as Record<string, unknown>;
              primary = (rm.primary as string) || "unknown";
              fallbacks = (rm.fallbacks as string[]) || [];
            }
            agents.push({
              id,
              workspace: getAgentWorkspace(id, ac.workspace as string | undefined),
              model: { primary, fallbacks },
              enabled: ac.enabled !== false,
            });
          }
        }
        if (agents.length === 0) {
          const rawDefault = cfg.agents?.defaults?.model || {};
          let primary = "default";
          let fallbacks: string[] = [];
          if (typeof rawDefault === "string") {
            primary = rawDefault;
          } else if (rawDefault && typeof rawDefault === "object") {
            const rd = rawDefault as Record<string, unknown>;
            primary = (rd.primary as string) || "default";
            fallbacks = (rd.fallbacks as string[]) || [];
          }
          agents.push({
            id: "main",
            workspace: getDefaultWorkspace(),
            model: { primary, fallbacks },
            enabled: true,
          });
        }
      } catch {
        agents.push({
          id: "main", workspace: getDefaultWorkspace(),
          model: { primary: "unknown", fallbacks: [] },
          enabled: true,
        });
      }

      json(res, { agents });
    },
  });

  // ── Channels status ─────────────────────────────────────────────────────────
  routes.set("channels", {
    method: "GET",
    handler: async (_url, _req, res) => {
      const configPath = getConfigPath();
      const builtinChannels = [
        "telegram", "whatsapp", "discord", "signal", "slack",
        "imessage", "webchat", "irc",
      ];
      const pluginChannels = [
        "feishu", "googlechat", "line", "matrix", "mattermost",
        "teams", "nextcloud", "nostr", "qqbot", "synology",
        "tlon", "twitch", "voicecall", "zalo",
      ];

      const channels: Array<{
        name: string; displayName: string;
        type: "builtin" | "plugin" | "external";
        enabled: boolean; configured: boolean;
        config: Record<string, unknown>;
      }> = [];

      try {
        const content = await readFile(configPath, "utf-8");
        const cfg = JSON.parse(content);
        const chConfig = cfg.channels || {};

        function isConfigured(c: unknown): boolean {
          if (!c || typeof c !== "object") return false;
          const keys = Object.keys(c as Record<string, unknown>).filter(
            (k) => k !== "enabled" && k !== "streaming"
          );
          return keys.length > 0;
        }

        function filterConfig(c: unknown): Record<string, unknown> {
          if (!c || typeof c !== "object") return {};
          const obj = c as Record<string, unknown>;
          const result: Record<string, unknown> = {};
          for (const k of Object.keys(obj).filter(k => k !== "enabled" && k !== "streaming")) {
            result[k] = obj[k];
          }
          return result;
        }

        for (const name of builtinChannels) {
          const c = chConfig[name];
          channels.push({
            name,
            displayName: displayName(name),
            type: "builtin",
            enabled: c ? c.enabled !== false : (name === "webchat"),
            configured: isConfigured(c),
            config: filterConfig(c),
          });
        }
        for (const name of pluginChannels) {
          const c = chConfig[name];
          channels.push({
            name,
            displayName: displayName(name),
            type: "plugin",
            enabled: c ? c.enabled !== false : false,
            configured: isConfigured(c),
            config: filterConfig(c),
          });
        }
      } catch {
        // Return empty list
      }

      json(res, { channels });
    },
  });

  // ── Logs (SSE) ──────────────────────────────────────────────────────────────
  routes.set("logs/stream", {
    method: "GET",
    handler: async (_url, _req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write("event: connected\ndata: {}\n\n");

      logClients.add(res);

      // Start log process if not running
      if (!logProcess) {
        startLogProcess();
      }

      _req.on("close", () => {
        logClients.delete(res);
        if (logClients.size === 0 && logProcess) {
          logProcess.kill();
          logProcess = null;
        }
      });
    },
  });

  // ── TUI Control ────────────────────────────────────────────────────────────
  routes.set("tui/restart", {
    method: "POST",
    handler: async (_url, _req, res) => {
      const ok = restartTuiPty();
      json(res, { ok, message: ok ? "TUI 已重启" : "重启失败" });
    },
  });

  routes.set("tui/status", {
    method: "GET",
    handler: async (_url, _req, res) => {
      json(res, {
        running: tuiPty !== null && !tuiPty.killed,
        pid: tuiPid,
        clients: tuiWsClients.size,
      });
    },
  });

  return routes;
}

function startLogProcess() {
  const stateDir = getStateDir();
  const commandsLog = join(stateDir, "logs", "commands.log");

  if (!existsSync(commandsLog)) {
    // Send a notification and close
    const msg = `data: ${JSON.stringify({ level: "system", text: "日志文件不存在: " + commandsLog })}\n\n`;
    for (const client of logClients) {
      client.write(msg);
    }
    return;
  }

  logProcess = spawn("tail", ["-f", "-n", "50", commandsLog], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  logProcess.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      const level = line.includes("error") || line.includes("ERROR") || line.includes("Error")
        ? "error" : line.includes("warn") || line.includes("WARN")
        ? "warn" : "info";
      const msg = `data: ${JSON.stringify({ level, text: line })}\n\n`;
      for (const client of logClients) {
        client.write(msg);
      }
    }
  });

  logProcess.on("exit", () => {
    logProcess = null;
    const msg = `data: ${JSON.stringify({ level: "system", text: "日志文件读取已结束" })}\n\n`;
    for (const client of logClients) {
      client.write(msg);
    }
  });
}

// ─── Route dispatcher ──────────────────────────────────────────────────────────
function parseRoute(urlPath: string): string | null {
  const prefix = "/api/openclaw/";
  if (!urlPath.startsWith(prefix)) return null;
  // Strip query string before route matching
  return urlPath.slice(prefix.length).replace(/\/$/, "").split("?")[0];
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function extractPid(statusText: string): number | null {
  const m = statusText.match(/pid[:\s]+(\d+)/i) || statusText.match(/PID:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function displayName(key: string): string {
  const names: Record<string, string> = {
    telegram: "Telegram", whatsapp: "WhatsApp", discord: "Discord",
    signal: "Signal", slack: "Slack", imessage: "iMessage",
    webchat: "WebChat", irc: "IRC", feishu: "飞书",
    googlechat: "Google Chat", line: "LINE", matrix: "Matrix",
    mattermost: "Mattermost", teams: "Microsoft Teams",
    nextcloud: "Nextcloud Talk", nostr: "Nostr", qqbot: "QQ Bot",
    synology: "Synology Chat", tlon: "Tlon", twitch: "Twitch",
    voicecall: "Voice Call", zalo: "Zalo",
  };
  return names[key] || key;
}

// ─── Vite config ───────────────────────────────────────────────────────────────

// Import os for homedir resolution
import os from "os";

// ─── Electron Production Fix Plugin ────────────────────────────────────────
// Vite 默认产出 <script type="module">，但 Electron 使用 file:// 协议加载时
// 浏览器安全策略会阻止 ES modules 执行。该插件在构建后将 HTML 中的
// type="module" 和 crossorigin 移除，并添加 defer 以保证正确的加载顺序。
function fixElectronHtmlPlugin() {
  return {
    name: "fix-electron-html",
    closeBundle() {
      const htmlPath = join(__dirname, "dist", "index.html");
      if (!existsSync(htmlPath)) return;
      let html = readFileSync(htmlPath, "utf-8");
      // Remove type="module" and crossorigin from script/link tags
      html = html.replace(/\s+type="module"/g, "");
      html = html.replace(/\s+crossorigin/g, "");
      // Add defer to script tags since module scripts are deferred by default
      html = html.replace(/(<script\s+)(?!.*\bdefer\b)/gi, (match, prefix) => {
        return prefix + 'defer ';
      });
      writeFileSync(htmlPath, html, "utf-8");
      console.log("[fix-electron-html] Patched dist/index.html for file:// protocol");
    },
  };
}

export default defineConfig({
  base: "./",
  root: ".",
  plugins: [
    vue(),
    fixElectronHtmlPlugin(),
    {
      name: "openclaw-helper-api",
      configureServer(server) {
        const router = createRouter();

        // ── TUI WebSocket ────────────────────────────────────────────────────
        const wss = new WebSocketServer({ noServer: true });

        wss.on("connection", (ws: WebSocket) => {
          tuiWsClients.add(ws);
          const pty = startTuiPty();
          if (!pty) {
            ws.send("\r\n\x1b[31m[无法启动 TUI 终端]\x1b[0m\r\n");
            ws.close();
            return;
          }

          ws.on("message", (raw) => {
            const data = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
            // Control messages: JSON with "type" field
            if (data.length > 10 && data[0] === "{") {
              try {
                const msg = JSON.parse(data);
                if (msg && typeof msg.type === "string") {
                  if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
                    resizeTuiPty(msg.cols, msg.rows);
                    return;
                  }
                  if (msg.type === "restart") {
                    restartTuiPty();
                    return;
                  }
                }
              } catch {}
            }
            // Forward as keystroke
            if (pty && !pty.killed) {
              pty.write(data);
            }
          });

          ws.on("close", () => {
            tuiWsClients.delete(ws);
            if (tuiWsClients.size === 0) {
              // Delay kill so quick reconnects don't restart
              setTimeout(() => {
                if (tuiWsClients.size === 0) stopTuiPty();
              }, 3000);
            }
          });
        });

        server.httpServer?.on("upgrade", (req, socket, head) => {
          const url = req.url || "";
          if (url.startsWith("/api/tui/ws")) {
            wss.handleUpgrade(req, socket, head, (ws) => {
              wss.emit("connection", ws, req);
            });
          }
        });

        // ── Cleanup on exit ──────────────────────────────────────────────────
        process.on("exit", () => stopTuiPty());
        process.on("SIGINT", () => { stopTuiPty(); process.exit(0); });
        process.on("SIGTERM", () => { stopTuiPty(); process.exit(0); });

        server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const route = parseRoute(req.url || "");
          if (!route) {
            next();
            return;
          }

          const handler = router.get(route);
          if (!handler) {
            error(res, `未知路由: ${route}`, 404);
            return;
          }

          if (handler.method !== "ALL" && req.method !== handler.method) {
            error(res, `方法不允许: ${req.method} (期望 ${handler.method})`, 405);
            return;
          }

          try {
            const url = new URL(req.url || "", "http://localhost");
            await handler.handler(url, req, res);
          } catch (err: unknown) {
            console.error(`[API Error] ${route}:`, err);
            error(res, (err as Error).message || "内部错误");
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": join(__dirname, "src/renderer"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
