<template>
  <div>
    <div class="grid-2">
      <!-- Gateway 状态 -->
      <div class="card">
        <div class="card-title">Gateway 状态</div>
        <div v-if="gateway.statusLoading" class="card-body-loading">
          <div class="spinner" />
          <span class="text-muted">加载中…</span>
        </div>
        <div v-else-if="gateway.statusError" class="card-body-error">
          <Icon name="alert-circle" :size="14" style="color:var(--red)" />
          <span style="color:var(--red);font-size:13px">{{ gateway.statusError }}</span>
          <button class="btn btn-sm" style="margin-top:6px" @click="gateway.fetchStatus()">重试</button>
        </div>
        <div v-else class="card-body">
          <div class="status-row">
            <span
              class="status-dot"
              :style="{ backgroundColor: gateway.running ? 'var(--green)' : 'var(--red)' }"
            />
            <strong :style="{ color: gateway.running ? 'var(--green)' : 'var(--red)' }">
              {{ gateway.running ? '运行中' : '已停止' }}
            </strong>
            <span v-if="gateway.status?.pid" class="chip text-xs">PID {{ gateway.status.pid }}</span>
          </div>
          <table class="info-table">
            <tr><td class="info-label">版本</td><td class="text-mono">{{ gateway.status?.version || '-' }} <span v-if="updateAvailable" class="badge badge-warning" style="font-size:10px;cursor:default">有新版本 {{ latestVersion }}</span></td></tr>
            <tr><td class="info-label">Node.js</td><td class="text-mono">{{ gateway.status?.nodeVersion || '-' }}</td></tr>
            <tr><td class="info-label">状态目录</td><td class="truncate text-xs" style="max-width:200px">{{ gateway.status?.stateDir || '-' }}</td></tr>
          </table>
        </div>
        <div v-if="!gateway.statusLoading && !gateway.statusError" class="card-actions">
          <div class="action-row">
            <template v-if="gateway.running">
              <button class="btn btn-sm btn-danger" @click="stopGateway">
                <Icon name="stop" :size="12" /> 停止
              </button>
              <button class="btn btn-sm" @click="restartGateway">
                <Icon name="refresh" :size="12" /> 重启
              </button>
            </template>
            <template v-else>
              <button class="btn btn-sm btn-primary" @click="startGateway">
                <Icon name="play" :size="12" /> 启动
              </button>
            </template>
            <span style="flex:1" />
            <button v-if="updateAvailable" class="btn btn-sm btn-success" :disabled="gateway.updateRunning" @click="runUpdateAsync">
              <Icon :name="gateway.updateRunning ? 'refresh' : 'arrow-up'" :size="12" />
              {{ gateway.updateRunning ? '升级中…' : '一键更新到 ' + latestVersion }}
            </button>
            <button class="btn btn-sm" :disabled="gateway.updateLoading" @click="checkUpdateNow">
              <Icon :name="gateway.updateLoading ? 'refresh' : 'search'" :size="12" :class="{ spin: gateway.updateLoading }" />
              检查更新
            </button>
            <button class="btn btn-sm btn-primary" @click="runDoctorAsync">
              <Icon name="heartbeat" :size="12" /> 运行诊断
            </button>
          </div>
        </div>
        <div v-if="doctorOutput" class="card-body" style="padding-top:8px">
          <div class="text-xs text-muted" style="margin-bottom:4px">诊断结果：</div>
          <pre class="doctor-output">{{ doctorOutput }}</pre>
        </div>
        <div v-if="updateOutput" class="card-body" style="padding-top:8px">
          <div class="text-xs text-muted" style="margin-bottom:4px">更新输出：</div>
          <pre class="doctor-output" :class="{ 'is-ok': updateOk }">{{ updateOutput }}</pre>
        </div>
      </div>

      <!-- 模型信息 -->
      <div class="card">
        <div class="card-title">模型配置</div>
        <div v-if="gateway.agentsLoading" class="card-body-loading">
          <div class="spinner" />
        </div>
        <div v-else-if="!gateway.agents.length" class="card-body" style="padding:1rem 0;text-align:center">
          <span class="text-muted text-xs">无可用模型</span>
        </div>
        <div v-else class="card-body">
          <div v-for="agent in gateway.agents" :key="agent.id" class="agent-block">
            <div class="agent-header">
              <span class="agent-id">{{ agent.id }}</span>
              <span v-if="agent.enabled" class="badge badge-success" style="font-size:10px">已启用</span>
              <span v-else class="badge badge-danger" style="font-size:10px">已禁用</span>
            </div>
            <div class="model-section" v-if="getModel(agent)">
              <div class="model-primary">
                <span class="text-xs text-muted">主模型</span>
                <span class="text-xs text-mono" style="color:var(--teal)">{{ getModel(agent).primary }}</span>
              </div>
              <div v-if="getModel(agent).fallbacks?.length" class="model-fallbacks">
                <span class="text-xs text-muted">备用模型</span>
                <div class="fallback-chips">
                  <span v-for="fb in getModel(agent).fallbacks" :key="fb" class="chip text-xs">{{ fb }}</span>
                </div>
              </div>
            </div>
            <div class="text-xs text-muted" style="margin-top:4px">
              <span class="text-mono" style="word-break:break-all">{{ agent.workspace }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 渠道概况 -->
      <div class="card">
        <div class="card-title">渠道概况</div>
        <div class="card-body">
          <div class="summary-grid">
            <div class="summary-item">
              <span class="summary-num">{{ gateway.channels.length }}</span>
              <span class="summary-label">总计</span>
            </div>
            <div class="summary-item">
              <span class="summary-num" style="color:var(--green)">{{ configuredCount }}</span>
              <span class="summary-label">已配置</span>
            </div>
            <div class="summary-item">
              <span class="summary-num" style="color:var(--blue)">{{ enabledCount }}</span>
              <span class="summary-label">已启用</span>
            </div>
            <div class="summary-item">
              <span class="summary-num" style="color:var(--maroon)">{{ builtinCount }}</span>
              <span class="summary-label">内置</span>
            </div>
            <div class="summary-item">
              <span class="summary-num" style="color:var(--lavender)">{{ pluginCount }}</span>
              <span class="summary-label">插件</span>
            </div>

          </div>
          <div v-if="configuredChannels.length" class="channel-list">
            <div class="text-xs text-muted" style="margin-bottom:4px">已配置渠道</div>
            <div class="channel-tags">
              <span v-for="ch in configuredChannels" :key="ch.name" class="chip text-xs">
                <span class="dot online" style="margin-right:4px;width:6px;height:6px" />
                {{ ch.displayName }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 工作区 -->
      <div class="card">
        <div class="card-title">工作区</div>
        <div class="card-body">
          <div class="text-xs text-mono" style="word-break:break-all">{{ gateway.currentWorkspace }}</div>
          <div class="workspace-stats">
            <div class="summary-item">
              <span class="summary-num">{{ workspaceFiles.length }}</span>
              <span class="summary-label">文件</span>
            </div>
            <div class="summary-item">
              <span class="summary-num" style="color:var(--yellow)">{{ memoryFileCount }}</span>
              <span class="summary-label">记忆文件</span>
            </div>
            <div class="summary-item">
              <span class="summary-num" style="color:var(--peach)">{{ wsMdCount }}</span>
              <span class="summary-label">Markdown</span>
            </div>
            <div class="summary-item">
              <span class="summary-num" style="color:var(--blue)">{{ formatSize(wsTotalBytes) }}</span>
              <span class="summary-label">总大小</span>
            </div>
          </div>
          <div v-if="workspaceFiles.length" class="file-summary">
            <div class="text-xs text-muted" style="margin-bottom:4px">核心文件：</div>
            <div v-for="f in workspaceFiles.slice(0, 8)" :key="f.name" class="file-row">
              <span class="file-name text-xs">{{ f.name }}</span>
              <span class="file-size text-xs text-muted">{{ formatSize(f.size) }}</span>
            </div>
            <div v-if="workspaceFiles.length > 8" class="text-xs text-muted" style="margin-top:4px">
              …还有 {{ workspaceFiles.length - 8 }} 个文件
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="msg" class="action-toast" :class="'toast-' + msgType">
      <Icon :name="msgType === 'success' ? 'check-circle' : 'alert-circle'" :size="14" />
      {{ msg }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import Icon from "../components/Icon.vue";
import { useGatewayStore, type AgentInfo } from "../stores/gateway";

const gateway = useGatewayStore();
const doctorOutput = ref("");
const updateOutput = ref("");
const updateOk = ref(false);

const updateAvailable = computed(() => {
  const avail = gateway.updateStatus?.availability as Record<string, unknown> | undefined;
  return avail?.available === true;
});
const latestVersion = computed(() => {
  const avail = gateway.updateStatus?.availability as Record<string, unknown> | undefined;
  return (avail?.latestVersion as string) || "?" ;
});

// ── Channel stats ───────────────────────────────────────────────────────────
const configuredCount = computed(() => gateway.channels.filter(c => c.configured).length);
const enabledCount = computed(() => gateway.channels.filter(c => c.enabled).length);
const builtinCount = computed(() => gateway.channels.filter(c => c.type === "builtin").length);
const pluginCount = computed(() => gateway.channels.filter(c => c.type === "plugin" || c.type === "external").length);
const configuredChannels = computed(() => gateway.channels.filter(c => c.configured));

// ── Workspace stats ─────────────────────────────────────────────────────────
const workspaceFiles = computed(() => gateway.workspaceFiles);
const memoryFileCount = computed(() => gateway.memoryFiles.length);
const wsMdCount = computed(() => workspaceFiles.value.filter(f => f.name.endsWith(".md")).length);
const wsTotalBytes = computed(() => workspaceFiles.value.reduce((sum, f) => sum + (f.size || 0), 0));

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function checkUpdateNow() {
  await gateway.checkUpdate();
}

async function runDoctorAsync() {
  doctorOutput.value = "";
  try {
    const result = await gateway.runDoctor();
    doctorOutput.value = result;
  } catch (err: unknown) {
    doctorOutput.value = `❌ 诊断失败: ${(err as Error).message}`;
  }
}

async function runUpdateAsync() {
  updateOutput.value = "等待更新开始…";
  updateOk.value = false;
  try {
    const result = await gateway.runUpdate();
    if (result.status === "running") {
      showToast("更新正在进行中…", "info");
      return;
    }
    gateway.updateRunning = true;
    showToast("正在更新 OpenClaw…", "success");

    // Poll update/result every 2s until done
    let pollCount = 0;
    const pollTimer = setInterval(async () => {
      pollCount++;
      if (pollCount > 150) {
        clearInterval(pollTimer);
        gateway.updateRunning = false;
        updateOutput.value += "\n\n❌ 超时：更新未能完成，请手动检查";
        showToast("更新超时，请手动检查", "error");
        return;
      }

      try {
        const state = await gateway.getUpdateResult();
        if (state.output) {
          // Keep last ~200 lines
          const lines = state.output.split("\n");
          updateOutput.value = lines.slice(-200).join("\n");
        }

        if (!state.running && state.finishedAt) {
          clearInterval(pollTimer);
          gateway.updateRunning = false;
          updateOk.value = state.code === 0;
          if (state.code === 0) {
            showToast("✅ 更新完成！可以刷新页面", "success");
          } else {
            showToast("❌ 更新失败，请查看输出详情", "error");
          }
        }
      } catch {
        // Network blips, keep polling
      }
    }, 2000);
  } catch (err: unknown) {
    updateOutput.value = `❌ 请求失败: ${(err as Error).message}`;
    gateway.updateRunning = false;
    showToast("更新启动失败", "error");
  }
}

function getModel(agent: AgentInfo): { primary: string; fallbacks?: string[] } | null {
  if (!agent.model) return null;
  if (typeof agent.model === "object") return agent.model as { primary: string; fallbacks?: string[] };
  return { primary: agent.model, fallbacks: [] };
}

// ── Toast ───────────────────────────────────────────────────────────────────
const msg = ref("");
const msgType = ref("success");

function showToast(text: string, type = "success") {
  msg.value = text;
  msgType.value = type;
  setTimeout(() => { msg.value = ""; }, 4000);
}

async function startGateway() {
  showToast("正在启动 Gateway…");
  try {
    await gateway.runAction(["gateway", "start"]);
    showToast("启动命令已发送");
    setTimeout(() => gateway.fetchStatus(), 2000);
  } catch (err: unknown) {
    showToast(`启动失败: ${(err as Error).message}`, "error");
  }
}

async function stopGateway() {
  showToast("正在停止 Gateway…");
  try {
    await gateway.runAction(["gateway", "stop"]);
    showToast("停止命令已发送");
    setTimeout(() => gateway.fetchStatus(), 2000);
  } catch (err: unknown) {
    showToast(`停止失败: ${(err as Error).message}`, "error");
  }
}

async function restartGateway() {
  showToast("正在重启 Gateway…");
  try {
    await gateway.runAction(["gateway", "restart"]);
    showToast("重启命令已发送");
    setTimeout(() => gateway.fetchStatus(), 3000);
  } catch (err: unknown) {
    showToast(`重启失败: ${(err as Error).message}`, "error");
  }
}

let updateTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  gateway.fetchStatus();
  gateway.checkUpdate();
  gateway.fetchChannels();
  gateway.fetchAgents();
  if (gateway.currentWorkspace) gateway.fetchWorkspaceFiles();

  // 定时刷新更新状态（每 30 分钟）
  updateTimer = setInterval(() => gateway.checkUpdate(), 30 * 60 * 1000);
});

onUnmounted(() => {
  if (updateTimer) clearInterval(updateTimer);
});
</script>

<style scoped>
.card-body-loading {
  display: flex; align-items: center; gap: 8px; padding: 2rem 0; justify-content: center;
}
.card-body-error {
  padding: 1rem 0; text-align: center;
}
.card-body { padding: 0; }
.status-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
}
.status-dot {
  width: 10px; height: 10px; border-radius: 50%; display: inline-block;
}
.info-table { width: 100%; }
.info-table td { padding: 3px 8px 3px 0; font-size: 12px; }
.info-label { color: var(--subtext1); white-space: nowrap; width: 80px; }
.card-actions {
  border-top: 1px solid var(--surface0);
  padding: 10px 0 0;
  margin-top: 8px;
}
.action-row {
  display: flex; gap: 6px; align-items: center;
  flex-wrap: wrap;
}
.action-row .btn {
  white-space: nowrap;
  flex-shrink: 0;
}
.doctor-output {
  margin: 0; max-height: 240px; overflow-y: auto;
  font-family: var(--font-mono); font-size: 11px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-all;
  color: var(--text-primary);
  background: var(--base); padding: 8px; border-radius: var(--radius-sm);
}
.doctor-output.is-ok {
  border: 1px solid var(--green);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Channel summary grid */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  background: var(--surface0);
  border-radius: var(--radius-md);
}
.summary-num {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}
.summary-label {
  font-size: 11px;
  color: var(--subtext1);
  margin-top: 2px;
}
.channel-list {
  margin-top: 8px;
}
.channel-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}
.chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--surface0);
  font-size: 11px;
}

/* Agent / Model section */
.agent-block {
  padding: 10px 0;
  border-bottom: 1px solid var(--surface0);
}
.agent-block:last-child { border-bottom: none; }
.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.model-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.model-primary {
  display: flex;
  align-items: center;
  gap: 8px;
}
.model-fallbacks {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.fallback-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.fallback-chips .chip {
  background: var(--mantle);
  color: var(--subtext1);
  font-size: 10px;
}

/* Workspace */
.workspace-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 10px;
  margin-bottom: 10px;
}
.workspace-stats .summary-item {
  padding: 6px 2px;
}
.workspace-stats .summary-num {
  font-size: 16px;
}
.file-summary {
  border-top: 1px solid var(--surface0);
  padding-top: 8px;
}
.file-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}
.file-name {
  font-family: var(--font-mono);
  color: var(--text-primary);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-size {
  flex-shrink: 0;
}

/* Toast */
.action-toast {
  position: fixed; bottom: 48px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: var(--radius-md);
  font-size: 13px; z-index: 100;
  background: var(--bg-secondary); border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.toast-success { border-color: var(--green); color: var(--green); }
.toast-error { border-color: var(--red); color: var(--red); }
</style>
