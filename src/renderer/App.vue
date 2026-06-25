<template>
  <div class="app-layout">
    <TopBar>
      <template #actions>
        <button class="btn btn-sm" @click="gateway.refreshAll()" :disabled="gateway.statusLoading">
          <Icon name="refresh" :size="14" />
        </button>
      </template>
    </TopBar>

    <div v-if="globalError" class="global-error-banner">
      <Icon name="alert-circle" :size="14" />
      <span>{{ globalError }}</span>
      <button class="btn btn-sm" style="margin-left:auto" @click="globalError = ''">✕</button>
    </div>

    <div class="main-area">
      <Sidebar @refresh="gateway.refreshAll()" />
      <main class="content-area">
        <router-view />
      </main>
    </div>

    <StatusBar
      :loading="gateway.statusLoading"
      :running="gateway.running"
      :version="gateway.status?.version || ''"
      :pid="gateway.status?.pid || null"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import TopBar from "./components/TopBar.vue";
import Sidebar from "./components/Sidebar.vue";
import StatusBar from "./components/StatusBar.vue";
import Icon from "./components/Icon.vue";
import { useGatewayStore } from "./stores/gateway";

const gateway = useGatewayStore();
const globalError = ref("");

// Catch unhandled errors and display them
window.addEventListener("error", (event) => {
  globalError.value = `[${event.filename?.split('/').pop()}:${event.lineno}] ${event.message}`;
  console.error("Global error:", event);
});
window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message || String(event.reason);
  globalError.value = `Promise: ${msg}`;
  console.error("Unhandled rejection:", event.reason);
});

onMounted(() => {
  gateway.refreshAll();
});
</script>

<style scoped>
.global-error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: color-mix(in srgb, var(--red) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--red) 20%, transparent);
  color: var(--red);
  font-size: 12px;
  font-family: var(--font-mono);
}
</style>
