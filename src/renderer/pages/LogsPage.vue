<template>
  <div>
    <div style="display:flex;gap:8px;margin-bottom:0.5rem;align-items:center;flex-wrap:wrap">
      <button class="btn btn-sm" @click="toggleStream" :disabled="loading">
        <Icon :name="streaming ? 'stop' : 'play'" :size="14" />
        {{ streaming ? '停止' : '开始监听' }}
      </button>
      <input v-model="search" placeholder="过滤日志…" class="input-sm" style="width:200px" />
      <span class="text-xs text-muted">{{ filteredLogs.length }} / {{ logs.length }} 条</span>
      <div style="flex:1" />
      <button class="btn btn-sm" @click="clearLogs">
        <Icon name="trash" :size="12" /> 清空
      </button>
    </div>

    <div class="log-container" ref="logContainer">
      <div v-if="filteredLogs.length === 0" class="log-placeholder">
        <p class="text-muted text-sm">尚无日志。点击"开始监听"接收实时日志流。</p>
      </div>
      <div v-for="(log, i) in filteredLogs" :key="i" class="log-line">
        <span class="log-level" :style="{ color: levelColor(log.level) }">{{ log.level }}</span>
        <span class="log-text">{{ log.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import Icon from "../components/Icon.vue";

const streaming = ref(false);
const loading = ref(false);
const logs = ref<{level: string; text: string}[]>([]);
const search = ref("");
const logContainer = ref<HTMLElement | null>(null);
let eventSource: EventSource | null = null;

const filteredLogs = computed(() => {
  if (!search.value) return logs.value;
  const q = search.value.toLowerCase();
  return logs.value.filter(l =>
    l.text.toLowerCase().includes(q) || l.level.includes(q)
  );
});

function toggleStream() {
  if (streaming.value) stopStream();
  else startStream();
}

function startStream() {
  streaming.value = true;
  loading.value = true;
  eventSource = new EventSource("/api/openclaw/logs/stream");
  eventSource.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      logs.value.push(data);
      if (logs.value.length > 1000) logs.value.splice(0, logs.value.length - 500);
      nextTick(() => {
        if (logContainer.value) {
          logContainer.value.scrollTop = logContainer.value.scrollHeight;
        }
      });
    } catch { /* ignore parse error */ }
  };
  eventSource.onerror = () => {
    stopStream();
  };
  loading.value = false;
}

function stopStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  streaming.value = false;
  loading.value = false;
}

function clearLogs() {
  logs.value = [];
}

function levelColor(level: string): string {
  const colors: Record<string, string> = {
    error: "var(--red)", warn: "var(--yellow)", info: "var(--blue)",
    debug: "var(--text-muted)", fatal: "var(--red)",
  };
  return colors[level] || "var(--text-muted)";
}
</script>

<style scoped>
.log-container {
  background: var(--crust);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px 0;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
}
.log-placeholder {
  padding: 2rem; text-align: center;
}
.log-line {
  display: flex; gap: 8px; padding: 1px 12px;
  transition: background 0.1s;
}
.log-line:hover { background: var(--surface0); }
.log-level {
  width: 44px; flex-shrink: 0; font-weight: 700; text-transform: uppercase;
}
.log-text {
  color: var(--subtext0); word-break: break-all;
}
.input-sm { font-size: 12px; padding: 4px 8px; height: 28px; }
</style>
