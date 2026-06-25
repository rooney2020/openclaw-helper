<template>
  <div class="statusbar">
    <div
      class="dot"
      :class="statusDot"
    />
    <span>{{ statusText }}</span>

    <div class="statusbar-separator" />
    <span v-if="version" class="text-xs">v{{ version }}</span>

    <div class="statusbar-separator" />
    <span class="text-xs">
      {{ running ? `PID: ${pid || '—'}` : '已停止' }}
    </span>

    <div class="statusbar-right">
      <span class="text-xs text-muted">{{ timeLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  loading: boolean;
  running: boolean;
  version: string;
  pid: number | null;
}>();

const statusDot = computed(() => {
  if (props.loading) return "loading";
  return props.running ? "online" : "offline";
});

const statusText = computed(() => {
  if (props.loading) return "检测中…";
  return props.running ? "Gateway 运行中" : "Gateway 未运行";
});

const timeLabel = computed(() => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
});
</script>
