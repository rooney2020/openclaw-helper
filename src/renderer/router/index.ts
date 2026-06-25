import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

import DashboardPage from "../pages/DashboardPage.vue";
import AgentsPage from "../pages/AgentsPage.vue";
import EditorPage from "../pages/EditorPage.vue";
import ConfigPage from "../pages/ConfigPage.vue";
import SessionsPage from "../pages/SessionsPage.vue";
import ChannelsPage from "../pages/ChannelsPage.vue";
import LogsPage from "../pages/LogsPage.vue";
import NotesPage from "../pages/NotesPage.vue";
import SkillsPage from "../pages/SkillsPage.vue";
import UsagePage from "../pages/UsagePage.vue";
import TuiPage from "../pages/TuiPage.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "dashboard", component: DashboardPage, meta: { title: "仪表板", icon: "dashboard" } },
  { path: "/agents", name: "agents", component: AgentsPage, meta: { title: "智能体管理", icon: "agents" } },
  { path: "/editor", name: "editor", component: EditorPage, meta: { title: "文件编辑", icon: "editor" } },
  { path: "/config", name: "config", component: ConfigPage, meta: { title: "配置编辑", icon: "config" } },
  { path: "/sessions", name: "sessions", component: SessionsPage, meta: { title: "会话管理", icon: "sessions" } },
  { path: "/channels", name: "channels", component: ChannelsPage, meta: { title: "渠道状态", icon: "channels" } },
  { path: "/notes", name: "notes", component: NotesPage, meta: { title: "每日笔记", icon: "file-text" } },
  { path: "/logs", name: "logs", component: LogsPage, meta: { title: "日志监控", icon: "logs" } },
  { path: "/skills", name: "skills", component: SkillsPage, meta: { title: "技能插件", icon: "terminal" } },
  { path: "/usage", name: "usage", component: UsagePage, meta: { title: "使用统计", icon: "bar-chart" } },
  { path: "/tui", name: "tui", component: TuiPage, meta: { title: "终端TUI", icon: "terminal" } },

];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
