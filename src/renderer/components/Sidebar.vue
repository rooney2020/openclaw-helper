<template>
  <nav class="sidebar">
    <div
      v-for="item in navItems"
      :key="item.route"
      class="sidebar-item"
      :class="{ active: currentRoute === item.route }"
      @click="navigate(item.route)"
      :title="item.label"
    >
      <Icon :name="item.icon" :size="18" />
      <span class="sidebar-label">{{ item.label }}</span>
    </div>

    <div class="sidebar-spacer" />

    <div class="sidebar-item" @click="emit('refresh')" title="刷新">
      <Icon name="refresh" :size="18" />
      <span class="sidebar-label">刷新</span>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import Icon from "./Icon.vue";

const emit = defineEmits<{ refresh: [] }>();

const router = useRouter();
const route = useRoute();
const currentRoute = computed(() => route.path);

const navItems = [
  { route: "/",        label: "仪表板",     icon: "dashboard" },
  { route: "/agents",  label: "智能体管理", icon: "agents" },
  { route: "/notes",   label: "记忆文件",   icon: "file-text" },
  { route: "/editor",  label: "核心文件",   icon: "editor" },
  { route: "/config",  label: "配置编辑",   icon: "config" },
  { route: "/sessions",label: "会话管理",   icon: "sessions" },
  { route: "/channels",label: "渠道状态",   icon: "channels" },
  { route: "/logs",    label: "日志监控",   icon: "logs" },
  { route: "/skills",  label: "技能插件",   icon: "terminal" },
  { route: "/usage",   label: "使用统计",   icon: "bar-chart" },
  { route: "/tui",     label: "终端TUI",    icon: "terminal" },
];

function navigate(path: string) {
  router.push(path);
}
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  background: var(--crust);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 6px 0;
  gap: 1px;
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 8px 10px;
  margin: 0 6px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
  position: relative;
  white-space: nowrap;
  width: 100%;
  box-sizing: border-box;
}
.sidebar-item:hover {
  background: var(--surface0);
}
.sidebar-item.active {
  background: var(--surface1);
}
.sidebar-item.active::before {
  content: "";
  position: absolute;
  left: -6px;
  width: 3px;
  height: 18px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
.sidebar-item svg {
  flex-shrink: 0;
  color: var(--overlay1);
  transition: color var(--transition-fast);
}
.sidebar-item:hover svg,
.sidebar-item.active svg {
  color: var(--text);
}
.sidebar-label {
  font-size: 13px;
  color: var(--text-muted);
  transition: color var(--transition-fast);
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-item:hover .sidebar-label,
.sidebar-item.active .sidebar-label {
  color: var(--text);
}
.sidebar-spacer { flex: 1; }
</style>
