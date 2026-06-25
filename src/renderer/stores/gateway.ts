import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "../api";

export interface GatewayStatus {
  running: boolean;
  version: string;
  nodeVersion: string;
  pid: number | null;
  raw: string;
  stateDir: string;
  configPath: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  exists: boolean;
}

export interface SessionInfo {
  key: string;
  agentId: string;
  fileSizeBytes: number;
  lastModified: number;
  hasMessages?: boolean;
  title?: string;
  isArchived?: boolean;
}

export interface ArchivedSessionInfo {
  key: string;
  originalSessionId: string;
  compactedAt: string;
  fileSizeBytes: number;
  lastModified: number;
  hasMessages?: boolean;
}

export interface AgentInfo {
  id: string;
  workspace: string;
  model: string | { primary?: string; fallbacks?: string[] };
  enabled: boolean;
}

export interface SessionUsageEntry {
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

export interface SessionUsageTotals {
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

export interface ChannelInfo {
  name: string;
  displayName: string;
  type: "builtin" | "plugin" | "external";
  enabled: boolean;
  configured: boolean;
  config: Record<string, unknown>;
}

export const useGatewayStore = defineStore("gateway", () => {
  // ─── State ──────────────────────────────────────────────────────────────────
  const status = ref<GatewayStatus | null>(null);
  const statusLoading = ref(false);
  const statusError = ref<string | null>(null);

  const workspaceFiles = ref<FileInfo[]>([]);
  const memoryFiles = ref<FileInfo[]>([]);
  const workspaceLoading = ref(false);

  const agents = ref<AgentInfo[]>([]);
  const agentsLoading = ref(false);

  const channels = ref<ChannelInfo[]>([]);
  const channelsLoading = ref(false);

  const sessions = ref<SessionInfo[]>([]);
  const sessionsLoading = ref(false);

  const archivedSessions = ref<ArchivedSessionInfo[]>([]);
  const archivedSessionsLoading = ref(false);

  const lastError = ref<string | null>(null);

  const workspacePath = ref<string | null>(null);
  const globalWorkspacePath = ref<string>("/home/tsdl/.openclaw/workspace");

  function setWorkspace(path: string | null) {
    workspacePath.value = path;
  }
  function resetWorkspace() {
    workspacePath.value = null;
  }

  // ─── Computed ───────────────────────────────────────────────────────────────
  const running = computed(() => status.value?.running ?? false);
  const currentWorkspace = computed(() =>
    workspacePath.value || globalWorkspacePath.value
  );

  // ─── Actions ────────────────────────────────────────────────────────────────
  async function fetchStatus() {
    statusLoading.value = true;
    statusError.value = null;
    try {
      status.value = await api.get<GatewayStatus>("status");
      if (status.value.stateDir) {
        globalWorkspacePath.value = `${status.value.stateDir}/workspace`;
      }
    } catch (err: unknown) {
      statusError.value = (err as Error).message;
      status.value = null;
    } finally {
      statusLoading.value = false;
    }
  }

  async function fetchWorkspaceFiles(path?: string) {
    workspaceLoading.value = true;
    try {
      const wp = path || currentWorkspace.value;
      const data = await api.get<{
        workspace: string;
        files: FileInfo[];
        memoryFiles: FileInfo[];
      }>("workspace/files", { workspace: wp });
      workspaceFiles.value = data.files;
      memoryFiles.value = data.memoryFiles;
    } catch (err: unknown) {
      lastError.value = (err as Error).message;
    } finally {
      workspaceLoading.value = false;
    }
  }

  async function readFile(filePath: string): Promise<string> {
    const data = await api.get<{ content: string; size: number }>("workspace/read", {
      path: filePath,
    });
    return data.content;
  }

  async function writeFile(filePath: string, content: string): Promise<void> {
    await api.put("workspace/write", { path: filePath, content });
  }

  async function readConfig(): Promise<{ content: string; path: string; exists: boolean }> {
    return api.get("config");
  }

  async function writeConfig(content: string): Promise<void> {
    await api.put("config", { content });
  }

  async function fetchAgents() {
    agentsLoading.value = true;
    try {
      const data = await api.get<{ agents: AgentInfo[] }>("agents");
      agents.value = data.agents;
    } catch (err: unknown) {
      lastError.value = (err as Error).message;
    } finally {
      agentsLoading.value = false;
    }
  }

  async function fetchChannels() {
    channelsLoading.value = true;
    try {
      const data = await api.get<{ channels: ChannelInfo[] }>("channels");
      channels.value = data.channels;
    } catch (err: unknown) {
      lastError.value = (err as Error).message;
    } finally {
      channelsLoading.value = false;
    }
  }

  async function updateChannelConfig(name: string, config: Record<string, unknown>) {
    const data = await api.post<{ ok: boolean }>("channels/config", { name, config });
    if (data.ok) await fetchChannels();
    return data;
  }

  async function deleteChannel(name: string) {
    const data = await api.post<{ ok: boolean }>("channels/delete", { name });
    if (data.ok) await fetchChannels();
    return data;
  }

  async function fetchUsage(
    agentId?: string
  ): Promise<{ sessions: SessionUsageEntry[]; totals: SessionUsageTotals | null }> {
    const params: Record<string, string> = {};
    if (agentId) params.agentId = agentId;
    return api.get("sessions/usage", params);
  }

  async function triggerScan(agentId?: string) {
    sessionsLoading.value = true;
    try {
      const params: Record<string, string> = {};
      if (agentId) params.agentId = agentId;
      const data = await api.get<{ sessions: SessionInfo[] }>("sessions/scan", params);
      sessions.value = data.sessions;
    } catch (err: unknown) {
      lastError.value = (err as Error).message;
    } finally {
      sessionsLoading.value = false;
    }
  }

  async function fetchArchivedSessions(agentId?: string) {
    archivedSessionsLoading.value = true;
    try {
      const params: Record<string, string> = {};
      if (agentId) params.agentId = agentId;
      const data = await api.get<{ sessions: ArchivedSessionInfo[] }>("sessions/archived", params);
      archivedSessions.value = data.sessions.map(s => ({ ...s, isArchived: true }));
    } catch (err: unknown) {
      lastError.value = (err as Error).message;
    } finally {
      archivedSessionsLoading.value = false;
    }
  }

  async function fetchSessions(agentId?: string) {
    sessionsLoading.value = true;
    try {
      const params: Record<string, string> = {};
      if (agentId) params.agentId = agentId;
      const data = await api.get<{ sessions: SessionInfo[] }>("sessions", params);
      sessions.value = data.sessions;
      // If cache is stale or empty, trigger background scan
      if (!data.sessions.length) {
        triggerScan(agentId);
      }
    } catch (err: unknown) {
      lastError.value = (err as Error).message;
    } finally {
      sessionsLoading.value = false;
    }
  }

  async function deleteSession(sessionPath: string): Promise<void> {
    await api.post("sessions/delete", { path: sessionPath });
  }

  async function searchSessionsContent(
    agentId: string, query: string
  ): Promise<Array<{key: string; matchCount: number; lineNumbers: number[]}> | null> {
    const data = await api.get<{ results: Array<{key: string; matchCount: number; lineNumbers: number[]}> | null }>(
      "sessions/search-content", { q: query, agentId }
    );
    return data.results;
  }

  async function readSessionLines(
    agentId: string,
    key: string,
    limit = 20,
    offsetLine?: number,
    startLine?: number
  ): Promise<{
    lines: string[];
    totalLines: number;
    startLine: number;
    endLine: number;
    hasMore: boolean;
  }> {
    return api.post("sessions/read", { agentId, key, limit, offsetLine, startLine });
  }

  async function runAction(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return api.post("action", { command: "openclaw", args });
  }

  async function runDoctor(): Promise<string> {
    const data = await api.post<{ stdout: string }>("doctor", {});
    return data.stdout;
  }

  // ── Update ────────────────────────────────────────────────────────────────────
  const updateStatus = ref<Record<string, unknown> | null>(null);
  const updateLoading = ref(false);
  const updateRunning = ref(false);

  async function checkUpdate(): Promise<void> {
    updateLoading.value = true;
    try {
      const data = await api.get<Record<string, unknown>>("update/status");
      updateStatus.value = data;
    } catch (err: unknown) {
      updateStatus.value = { error: (err as Error).message };
    } finally {
      updateLoading.value = false;
    }
  }

  async function runUpdate(): Promise<{ status: string; message: string }> {
    updateRunning.value = true;
    const result = await api.post<{ status: string; message: string }>("update/run", {});
    return result;
  }

  async function readUpdateLog(): Promise<{ content: string; exists: boolean }> {
    try {
      return await api.get<{ content: string; exists: boolean }>("update/log");
    } catch {
      return { content: "", exists: false };
    }
  }

  async function getUpdateResult(): Promise<{
    running: boolean;
    output: string;
    code: number | null;
    startedAt: number;
    finishedAt: number | null;
  }> {
    return api.get("update/result");
  }

  async function refreshAll() {
    await Promise.all([
      fetchStatus(),
      fetchAgents(),
      fetchChannels(),
    ]);
    if (currentWorkspace.value) {
      await fetchWorkspaceFiles();
    }
  }

  return {
    status, statusLoading, statusError,
    workspaceFiles, memoryFiles, workspaceLoading,
    agents, agentsLoading,
    channels, channelsLoading,
    sessions, sessionsLoading,
    archivedSessions, archivedSessionsLoading,
    workspacePath, globalWorkspacePath,
    setWorkspace, resetWorkspace,
    lastError,
    running, currentWorkspace,
    fetchStatus, fetchWorkspaceFiles, readFile, writeFile,
    readConfig, writeConfig,
    fetchAgents, fetchChannels, updateChannelConfig, deleteChannel, fetchSessions, deleteSession,
    fetchUsage,
    triggerScan, fetchArchivedSessions, searchSessionsContent, readSessionLines,
    runAction, runDoctor, refreshAll,
    updateStatus, updateLoading, updateRunning,
    checkUpdate, runUpdate, readUpdateLog, getUpdateResult,
  };
});
