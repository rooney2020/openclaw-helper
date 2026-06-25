<template>
  <div>
    <!-- 加载中 -->
    <div v-if="loading" class="card" style="text-align:center;padding:2rem">
      <div class="spinner" />
      <p class="text-muted text-sm">加载中…</p>
    </div>

    <template v-else-if="error">
      <div class="card" style="text-align:center;padding:2rem">
        <p class="text-sm" style="color:var(--red)">{{ error }}</p>
        <button class="btn btn-sm" @click="refresh">重试</button>
      </div>
    </template>

    <template v-else>
      <!-- 概要卡片 -->
      <div class="summary-row">
        <div class="card summary-card">
          <div class="summary-label">会话总数</div>
          <div class="summary-value">{{ totals?.totalSessions ?? '—' }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">含 Token 数据</div>
          <div class="summary-value">{{ totals?.sessionWithTokens ?? '—' }}</div>
          <div class="summary-sub" v-if="totals && totals.totalSessions > 0">
            {{ ((totals.sessionWithTokens / totals.totalSessions) * 100).toFixed(0) }}%
          </div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">总输入 Token</div>
          <div class="summary-value">{{ formatCount(totals?.totalInputTokens ?? 0) }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">总输出 Token</div>
          <div class="summary-value">{{ formatCount(totals?.totalOutputTokens ?? 0) }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">总 Token</div>
          <div class="summary-value">{{ formatCount(totals?.totalTokens ?? 0) }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">总费用</div>
          <div class="summary-value summary-cost">{{ formatCost(totals?.totalCostUsd ?? 0) }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">缓存命中</div>
          <div class="summary-value" style="color:var(--green)">{{ formatCount(totals?.totalCacheRead ?? 0) }}</div>
          <div class="summary-sub" v-if="(totals?.totalCacheWrite ?? 0) > 0">写入 {{ formatCount(totals?.totalCacheWrite ?? 0) }}</div>
        </div>
        <div class="card summary-card">
          <div class="summary-label">总请求次数</div>
          <div class="summary-value">{{ totalRequests }}</div>
        </div>
      </div>

      <!-- 缓存说明 -->
      <div class="note-card" v-if="(totals?.totalCacheRead ?? 0) > (totals?.totalTokens ?? 0)">
        <Icon name="info" :size="13" />
        <span class="text-xs">
          缓存命中（{{ formatCount(totals?.totalCacheRead ?? 0) }}）超过总 Token（{{ formatCount(totals?.totalTokens ?? 0) }}）是正常现象。
          每次请求会复用之前对话的历史缓存，累计的缓存读取量会远超本次新增的输入/输出 Token。
          这恰恰说明缓存机制在有效运作，帮你节省了实际 API 费用。
        </span>
      </div>

      <!-- 按模型统计 -->
      <div class="section-label">按模型</div>
      <div class="card-grid">
        <div v-for="m in modelStats" :key="m.model" class="card stat-card">
          <div class="stat-title">{{ m.model }}</div>
          <div class="stat-row">
            <span class="stat-label">会话</span>
            <span class="stat-val">{{ m.count }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">输入</span>
            <span class="stat-val">{{ formatCount(m.inputTokens) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">输出</span>
            <span class="stat-val">{{ formatCount(m.outputTokens) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">费用</span>
            <span class="stat-val">{{ formatCost(m.cost) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">时长</span>
            <span class="stat-val">{{ formatDuration(m.runtimeMs) }}</span>
          </div>
          <div class="stat-row" v-if="m.cacheRead > 0">
            <span class="stat-label">缓存命中</span>
            <span class="stat-val" style="color:var(--green)">{{ formatCount(m.cacheRead) }}</span>
          </div>
        </div>
      </div>

      <!-- 按渠道统计 -->
      <div class="section-label">按渠道</div>
      <div class="card-grid">
        <div v-for="c in channelStats" :key="c.channel" class="card stat-card">
          <div class="stat-title">{{ c.channel }}</div>
          <div class="stat-row">
            <span class="stat-label">会话</span>
            <span class="stat-val">{{ c.count }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Token</span>
            <span class="stat-val">{{ formatCount(c.totalTokens) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">费用</span>
            <span class="stat-val">{{ formatCost(c.cost) }}</span>
          </div>
        </div>
      </div>

      <!-- 会话明细 -->
      <div class="section-label">
        会话明细
        <span class="text-xs text-muted" style="margin-left:6px">最近 {{ sessions.length }} 条</span>
      </div>
      <div class="session-table-wrap">
        <table class="session-table">
          <thead>
            <tr>
              <th>标签</th>
              <th>模型</th>
              <th>请求</th>
              <th>输入</th>
              <th>输出</th>
              <th>Token 合计</th>
              <th>缓存命中</th>
              <th>思考</th>
              <th>费用</th>
              <th>耗时</th>
              <th>压缩</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sessions" :key="s.key" class="session-row">
              <td class="text-xs" :title="s.key">{{ s.label || s.key.slice(0, 12) }}</td>
              <td class="text-xs text-muted">{{ s.model }}</td>
              <td class="text-xs text-right">{{ s.messageCount || '-' }}</td>
              <td class="text-xs text-right">{{ formatCount(s.inputTokens) }}</td>
              <td class="text-xs text-right">{{ formatCount(s.outputTokens) }}</td>
              <td class="text-xs text-right">{{ formatCount(s.totalTokens) }}</td>
              <td class="text-xs text-right" :class="s.cacheRead > 0 ? 'text-green' : ''">{{ formatCount(s.cacheRead) }}</td>
              <td class="text-xs">
                <span v-if="s.thinkingLevel && s.thinkingLevel !== '—'" class="badge badge-info" style="font-size:9px">{{ s.thinkingLevel }}</span>
                <span v-else class="text-muted text-xs">—</span>
              </td>
              <td class="text-xs text-right">{{ formatCost(s.estimatedCostUsd) }}</td>
              <td class="text-xs text-right">{{ formatDuration(s.runtimeMs) }}</td>
              <td class="text-xs text-right">{{ s.compactionCount || '-' }}</td>
              <td class="text-xs">
                <span class="badge" :class="statusBadgeClass(s.status)" style="font-size:9px">{{ s.status }}</span>
                <span v-if="s.spawnDepth > 0" class="text-xs text-muted" style="margin-left:2px" title="子会话">⊞{{ s.spawnDepth }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 无数据提示 -->
      <div v-if="sessions.length === 0" class="card" style="text-align:center;padding:1.5rem">
        <p class="text-muted text-sm">暂无使用数据</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useGatewayStore, type SessionUsageEntry, type SessionUsageTotals } from "../stores/gateway";

const gateway = useGatewayStore();
const loading = ref(false);
const error = ref<string | null>(null);
const sessions = ref<SessionUsageEntry[]>([]);
const totals = ref<SessionUsageTotals | null>(null);

const modelStats = computed(() => {
  const map = new Map<string, { count: number; inputTokens: number; outputTokens: number; cost: number; runtimeMs: number; cacheRead: number }>();
  for (const s of sessions.value) {
    const key = s.model || "未知";
    let entry = map.get(key);
    if (!entry) {
      entry = { count: 0, inputTokens: 0, outputTokens: 0, cost: 0, runtimeMs: 0, cacheRead: 0 };
      map.set(key, entry);
    }
    entry.count++;
    entry.inputTokens += s.inputTokens;
    entry.outputTokens += s.outputTokens;
    entry.cost += s.estimatedCostUsd;
    entry.runtimeMs += s.runtimeMs;
    entry.cacheRead += s.cacheRead;
  }
  return Array.from(map.entries())
    .map(([model, data]) => ({ model, ...data }))
    .sort((a, b) => b.cost - a.cost);
});

const totalRequests = computed(() => {
  return sessions.value.reduce((sum, s) => sum + (s.messageCount || 0), 0);
});

const channelStats = computed(() => {
  const map = new Map<string, { count: number; totalTokens: number; cost: number }>();
  for (const s of sessions.value) {
    const key = s.channel || "未知";
    let entry = map.get(key);
    if (!entry) {
      entry = { count: 0, totalTokens: 0, cost: 0 };
      map.set(key, entry);
    }
    entry.count++;
    entry.totalTokens += s.totalTokens;
    entry.cost += s.estimatedCostUsd;
  }
  return Array.from(map.entries())
    .map(([channel, data]) => ({ channel, ...data }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
});

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatCost(cost: number): string {
  if (cost <= 0) return "$0";
  if (cost < 0.01) return "$" + cost.toFixed(6);
  return "$" + cost.toFixed(4);
}

function formatDuration(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return ms + "ms";
  if (ms < 60_000) return (ms / 1000).toFixed(1) + "s";
  return (ms / 60_000).toFixed(1) + "min";
}

function statusBadgeClass(status: string): string {
  if (status === "done") return "badge-success";
  if (status === "error" || status === "cancelled") return "badge-error";
  if (status === "running" || status === "active") return "badge-info";
  return "badge-muted";
}

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    const data = await gateway.fetchUsage();
    sessions.value = data.sessions || [];
    totals.value = data.totals;
    if (data.totals === null) {
      error.value = "暂无使用数据";
    }
  } catch (err: any) {
    error.value = err.message || "加载失败";
    console.error("Failed to load usage:", err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => refresh());
</script>

<style scoped>
.summary-row {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: 12px;
}
.summary-card {
  flex: 1;
  min-width: 110px;
  padding: 10px 12px;
  text-align: center;
}
.summary-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.summary-value {
  font-size: 18px;
  font-weight: 700;
}
.summary-cost {
  color: var(--yellow);
}
.summary-sub {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.section-label {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
  margin-top: 6px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px;
  margin-bottom: 10px;
}

.stat-card {
  padding: 10px 12px;
}
.stat-title {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--surface0);
}
.stat-row {
  display: flex; justify-content: space-between;
  font-size: 11px;
  padding: 2px 0;
}
.stat-label {
  color: var(--text-muted);
}
.stat-val {
  font-weight: 500;
}

/* 会话明细表 */
.session-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.session-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.session-table th {
  text-align: left;
  padding: 6px 8px;
  background: var(--surface0);
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
}
.session-table td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--surface0);
  vertical-align: middle;
}
.session-row:hover {
  background: var(--surface0);
}
.text-right {
  text-align: right;
}
.text-green {
  color: var(--green);
}
.note-card {
  display: flex; align-items: flex-start; gap: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
  background: rgba(203, 166, 247, 0.08);
  border: 1px solid var(--surface0);
  border-radius: var(--radius-md);
}
</style>
