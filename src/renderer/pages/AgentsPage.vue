<template>
  <div>
    <div v-if="gateway.agentsLoading" class="grid-2">
      <div v-for="i in 3" :key="i" class="card" style="text-align:center;padding:2rem">
        <div class="spinner" />
        <p class="text-muted text-sm">加载中…</p>
      </div>
    </div>

    <div v-else class="grid-2">
      <div v-for="agent in gateway.agents" :key="agent.id" class="card">
        <div class="card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="badge badge-info" style="font-size:11px">{{ agent.id }}</span>
          <span
            class="badge"
            :class="agent.enabled ? 'badge-success' : 'badge-danger'"
            style="font-size:10px"
          >
            {{ agent.enabled ? '已启用' : '已禁用' }}
          </span>
        </div>

        <div class="text-xs text-muted truncate" style="margin-bottom:8px">
          {{ agent.workspace || '—' }}
        </div>

        <div class="agent-model-block">
          <div class="agent-model-primary">
            <Icon name="models" :size="12" style="color:var(--blue);flex-shrink:0" />
            <span class="text-xs text-mono">{{ modelPrimary(agent) }}</span>
          </div>
          <div v-if="modelFallbacks(agent).length" class="agent-model-fallbacks">
            <span class="text-xs text-muted" style="flex-shrink:0">备用</span>
            <span
              v-for="fb in modelFallbacks(agent)"
              :key="fb"
              class="chip text-xs"
            >{{ trimModel(fb) }}</span>
          </div>
          <div v-else class="agent-model-fallbacks">
            <span class="text-xs text-muted">无备用模型</span>
          </div>
        </div>

        <div class="agent-stats">
          <div class="agent-stat">
            <span class="text-xs text-muted">会话</span>
            <span class="text-xs font-mono">{{ sessionCounts.get(agent.id) ?? '…' }}</span>
          </div>
          <div class="agent-stat">
            <span class="text-xs text-muted">工作区</span>
            <span class="text-xs font-mono">{{ agent.workspace ? '✓' : '—' }}</span>
          </div>
        </div>

        <div class="agent-actions">
          <button class="btn btn-sm" @click="viewSessions(agent)">
            <Icon name="sessions" :size="12" /> 会话
          </button>
          <button v-if="agent.workspace" class="btn btn-sm" @click="openWorkspace(agent)">
            <Icon name="editor" :size="12" /> 编辑文件
          </button>
          <button class="btn btn-sm" @click="editConfig(agent)">
            <Icon name="config" :size="12" /> 配置
          </button>
        </div>
      </div>
    </div>

    <div v-if="!gateway.agentsLoading && gateway.agents.length === 0" class="card" style="text-align:center;padding:2rem">
      <p class="text-muted text-sm">未发现智能体配置。请先在 OpenClaw 配置中添加 agent。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import { useGatewayStore, type AgentInfo } from "../stores/gateway";
import { api } from "../api";

const router = useRouter();
const gateway = useGatewayStore();
const sessionCounts = ref(new Map<string, number>());

function modelPrimary(agent: AgentInfo): string {
  if (!agent.model) return "未知";
  if (typeof agent.model === "object") {
    const m = agent.model as { primary: string; fallbacks?: string[] };
    return m.primary || "未知";
  }
  return agent.model as string;
}

function modelFallbacks(agent: AgentInfo): string[] {
  if (!agent.model) return [];
  if (typeof agent.model === "object") {
    return (agent.model as { primary: string; fallbacks?: string[] }).fallbacks || [];
  }
  return [];
}

function trimModel(id: string): string {
  const parts = id.split("/");
  return parts.length > 1 ? parts[1] : id;
}

async function fetchSessionCounts() {
  for (const agent of gateway.agents) {
    try {
      const data = await api.get<{ sessions: any[] }>("sessions", { agentId: agent.id });
      sessionCounts.value.set(agent.id, data.sessions.length);
    } catch {
      sessionCounts.value.set(agent.id, 0);
    }
  }
  // Trigger reactivity by replacing the map
  sessionCounts.value = new Map(sessionCounts.value);
}

function openWorkspace(agent: AgentInfo) {
  if (!agent.workspace) return;
  gateway.setWorkspace(agent.workspace);
  gateway.fetchWorkspaceFiles();
  router.push("/editor");
}

function editConfig(agent: AgentInfo) {
  router.push("/config");
}

function viewSessions(agent: AgentInfo) {
  router.push("/sessions");
}

onMounted(() => {
  if (gateway.agents.length === 0) {
    gateway.fetchAgents().then(() => fetchSessionCounts());
  } else {
    fetchSessionCounts();
  }
});
</script>

<style scoped>
.agent-model-block {
  background: var(--surface0);
  border-radius: var(--radius-sm);
  padding: 8px;
  margin-bottom: 8px;
}
.agent-model-primary {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 4px;
}
.agent-model-primary span {
  word-break: break-all;
}
.agent-model-fallbacks {
  display: flex; align-items: center; gap: 4px;
  flex-wrap: wrap;
}
.agent-stats {
  display: flex; gap: 12px;
  margin-bottom: 8px;
}
.agent-stat {
  display: flex; align-items: center; gap: 4px;
}
.agent-actions {
  display: flex; gap: 6px;
  border-top: 1px solid var(--surface0);
  padding-top: 8px;
}
</style>
