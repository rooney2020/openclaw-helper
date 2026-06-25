<template>
  <div class="topbar">
    <div class="topbar-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
      </svg>
      OpenClawHelper v0.1
    </div>
    <div class="topbar-spacer" />
    <div class="topbar-actions">
      <slot name="actions" />
    </div>
    <div class="window-controls">
      <button class="win-btn win-btn-min" @click="minimize" title="最小化">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
        </svg>
      </button>
      <button class="win-btn win-btn-max" @click="maximize" title="最大化/还原">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1" fill="none" />
        </svg>
      </button>
      <button class="win-btn win-btn-close" @click="close" title="关闭">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2" />
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
declare const window: Window & { electronAPI?: { invoke: (channel: string, ...args: unknown[]) => unknown } };

function minimize() {
  window.electronAPI?.invoke("window:minimize");
}
function maximize() {
  window.electronAPI?.invoke("window:maximize");
}
function close() {
  window.electronAPI?.invoke("window:close");
}
</script>

<style scoped>
.topbar {
  height: var(--topbar-height);
  background: var(--mantle);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 8px 0 12px;
  gap: 8px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}
.topbar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--overlay1);
  display: flex;
  align-items: center;
  gap: 6px;
}
.topbar-spacer { flex: 1; }
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}
.window-controls {
  display: flex;
  align-items: center;
  margin-left: 8px;
  -webkit-app-region: no-drag;
}
.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: var(--topbar-height);
  border: none;
  background: transparent;
  color: var(--overlay1);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.win-btn:hover {
  background: var(--surface0);
  color: var(--text);
}
.win-btn-close:hover {
  background: var(--red);
  color: var(--crust);
}
</style>
