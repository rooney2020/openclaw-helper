<template>
  <div>
    <!-- 顶部工具栏 -->
    <div class="skills-toolbar">
      <div class="skills-tabs">
        <button class="tab-btn" :class="{ active: activeTab === 'skills' }" @click="activeTab = 'skills'">
          <Icon name="file-text" :size="13" /> 技能 ({{ skillStats.ready }}/{{ skillStats.total }})
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'plugins' }" @click="activeTab = 'plugins'">
          <Icon name="plugins" :size="13" /> 插件 ({{ pluginStats.enabled }}/{{ pluginStats.total }})
        </button>
      </div>
      <div style="flex:1" />
      <input
        v-model="searchQuery"
        :placeholder="activeTab === 'skills' ? '搜索技能…' : '搜索插件…'"
        class="input-sm"
        style="width:180px"
      />
      <button class="btn btn-sm" @click="refresh" :disabled="loading">
        <Icon name="refresh" :size="12" /> {{ loading ? '加载中…' : '刷新' }}
      </button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="card" style="text-align:center;padding:2rem">
      <div class="spinner" />
      <p class="text-muted text-sm">加载中…</p>
    </div>

    <!-- ======================== 技能 TAB ======================== -->
    <template v-else-if="activeTab === 'skills'">
      <div v-if="filteredSkills.length === 0" class="card" style="text-align:center;padding:2rem">
        <p class="text-muted text-sm">{{ searchQuery ? '没有匹配的技能' : '暂无技能数据' }}</p>
      </div>
      <template v-else>
        <!-- 内置技能 -->
        <div class="section-card">
          <div class="section-header" @click="toggleSection('skill-builtin')">
            <Icon :name="sections['skill-builtin'] ? 'chevron-right' : 'chevron-down'" :size="14" />
            <span class="section-title">内置技能</span>
            <span class="badge badge-info" style="font-size:10px">{{ builtinSkills.length }}</span>
          </div>
          <div v-show="!sections['skill-builtin']" class="card-grid">
            <div v-for="skill in builtinSkills" :key="skill.name" class="card skill-card">
              <div class="skill-card-body">
                <div class="skill-card-header">
                  <span class="skill-name">
                    <span v-if="skill.emoji" v-text="skill.emoji" />
                    {{ skill.name }}
                  </span>
                  <span
                    class="badge"
                    :class="skill.eligible ? 'badge-success' : 'badge-muted'"
                    style="font-size:10px;flex-shrink:0"
                  >
                    {{ skill.eligible ? '就绪' : '不可用' }}
                  </span>
                </div>
                <p class="skill-desc">{{ skill.description || '—' }}</p>
                <div v-if="!skill.eligible && skill.missing" class="skill-missing">
                  <span class="text-xs" style="color:var(--red)">缺失:</span>
                  <template v-if="skill.missing.bins?.length">
                    <span v-for="b in skill.missing.bins" :key="b" class="chip chip-error text-xs">{{ b }}</span>
                  </template>
                  <template v-if="skill.missing.anyBins?.length">
                    <span v-for="b in skill.missing.anyBins" :key="b" class="chip chip-error text-xs">{{ b }}</span>
                  </template>
                  <template v-if="skill.missing.os?.length">
                    <span v-for="o in skill.missing.os" :key="o" class="chip chip-error text-xs">{{ o }}</span>
                  </template>
                  <template v-if="skill.missing.env?.length">
                    <span v-for="e in skill.missing.env" :key="e" class="chip chip-error text-xs">{{ e }}</span>
                  </template>
                </div>
              </div>
              <div class="skill-card-footer">
                <span class="text-xs text-muted">来源: {{ skill.source }}</span>
                <span v-if="skill.homepage" class="text-xs">
                  <a :href="skill.homepage" target="_blank" class="link-muted"><Icon name="external-link" :size="9" /> 主页</a>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 非内置技能 -->
        <div class="section-card">
          <div class="section-header" @click="toggleSection('skill-nonbuiltin')">
            <Icon :name="sections['skill-nonbuiltin'] ? 'chevron-right' : 'chevron-down'" :size="14" />
            <span class="section-title">非内置技能</span>
            <span class="badge badge-muted" style="font-size:10px">{{ nonBuiltinSkills.length }}</span>
          </div>
          <div v-show="!sections['skill-nonbuiltin']" class="card-grid">
            <div v-for="skill in nonBuiltinSkills" :key="skill.name" class="card skill-card">
              <div class="skill-card-body">
                <div class="skill-card-header">
                  <span class="skill-name">
                    <span v-if="skill.emoji" v-text="skill.emoji" />
                    {{ skill.name }}
                  </span>
                  <span
                    class="badge"
                    :class="skill.eligible ? 'badge-success' : 'badge-muted'"
                    style="font-size:10px;flex-shrink:0"
                  >
                    {{ skill.eligible ? '就绪' : '不可用' }}
                  </span>
                </div>
                <p class="skill-desc">{{ skill.description || '—' }}</p>
                <div v-if="!skill.eligible && skill.missing" class="skill-missing">
                  <span class="text-xs" style="color:var(--red)">缺失:</span>
                  <template v-if="skill.missing.bins?.length">
                    <span v-for="b in skill.missing.bins" :key="b" class="chip chip-error text-xs">{{ b }}</span>
                  </template>
                  <template v-if="skill.missing.anyBins?.length">
                    <span v-for="b in skill.missing.anyBins" :key="b" class="chip chip-error text-xs">{{ b }}</span>
                  </template>
                  <template v-if="skill.missing.os?.length">
                    <span v-for="o in skill.missing.os" :key="o" class="chip chip-error text-xs">{{ o }}</span>
                  </template>
                  <template v-if="skill.missing.env?.length">
                    <span v-for="e in skill.missing.env" :key="e" class="chip chip-error text-xs">{{ e }}</span>
                  </template>
                </div>
              </div>
              <div class="skill-card-footer">
                <span class="text-xs text-muted">来源: {{ skill.source }}</span>
                <span v-if="skill.homepage" class="text-xs">
                  <a :href="skill.homepage" target="_blank" class="link-muted"><Icon name="external-link" :size="9" /> 主页</a>
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ======================== 插件 TAB ======================== -->
    <template v-else>
      <div v-if="filteredPlugins.length === 0" class="card" style="text-align:center;padding:2rem">
        <p class="text-muted text-sm">{{ searchQuery ? '没有匹配的插件' : '暂无插件数据' }}</p>
      </div>
      <template v-else>
        <!-- 已启用 -->
        <div class="section-card">
          <div class="section-header" @click="toggleSection('plugin-enabled')">
            <Icon :name="sections['plugin-enabled'] ? 'chevron-right' : 'chevron-down'" :size="14" />
            <span class="section-title">已启用</span>
            <span class="badge badge-success" style="font-size:10px">{{ enabledPlugins.length }}</span>
          </div>
          <div v-show="!sections['plugin-enabled']" class="card-grid card-grid-narrow">
            <div v-for="plugin in enabledPlugins" :key="plugin.id" class="card plugin-card">
              <div class="plugin-card-header">
                <span class="plugin-name">{{ plugin.name || plugin.id }}</span>
                <span class="badge badge-success" style="font-size:9px">启用</span>
              </div>
              <p class="plugin-desc">{{ plugin.description || '—' }}</p>
              <div class="plugin-meta">
                <span class="text-xs text-muted">ID: {{ plugin.id }}</span>
                <span class="text-xs text-muted">{{ plugin.format }}</span>
                <span v-if="plugin.version" class="text-xs text-muted">v{{ plugin.version }}</span>
              </div>
              <div class="plugin-actions">
                <button class="btn btn-xs btn-danger" @click="togglePlugin(plugin, false)">
                  <Icon name="x" :size="10" /> 禁用
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 已禁用 -->
        <div class="section-card">
          <div class="section-header" @click="toggleSection('plugin-disabled')">
            <Icon :name="sections['plugin-disabled'] ? 'chevron-right' : 'chevron-down'" :size="14" />
            <span class="section-title">已禁用</span>
            <span class="badge badge-muted" style="font-size:10px">{{ disabledPlugins.length }}</span>
          </div>
          <div v-show="!sections['plugin-disabled']" class="card-grid card-grid-narrow">
            <div v-for="plugin in disabledPlugins" :key="plugin.id" class="card plugin-card">
              <div class="plugin-card-header">
                <span class="plugin-name">{{ plugin.name || plugin.id }}</span>
                <span class="badge badge-muted" style="font-size:9px">禁用</span>
              </div>
              <p class="plugin-desc">{{ plugin.description || '—' }}</p>
              <div class="plugin-meta">
                <span class="text-xs text-muted">ID: {{ plugin.id }}</span>
                <span class="text-xs text-muted">{{ plugin.format }}</span>
                <span v-if="plugin.version" class="text-xs text-muted">v{{ plugin.version }}</span>
              </div>
              <div class="plugin-actions">
                <button class="btn btn-xs btn-primary" @click="togglePlugin(plugin, true)">
                  <Icon name="check" :size="10" /> 启用
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import Icon from "../components/Icon.vue";
import { useGatewayStore } from "../stores/gateway";

interface SkillInfo {
  name: string;
  description: string;
  emoji: string;
  eligible: boolean;
  disabled: boolean;
  source: string;
  bundled: boolean;
  homepage: string;
  missing: { bins: string[]; anyBins: string[]; env: string[]; config: string[]; os: string[] };
}

interface PluginInfo {
  id: string;
  name: string;
  description: string;
  format: string;
  enabled: boolean;
  status: string;
  version: string;
  origin: string;
}

const gateway = useGatewayStore();
const activeTab = ref<"skills" | "plugins">("skills");
const searchQuery = ref("");
const loading = ref(false);

// Collapsible sections — true = collapsed
const sections = ref<Record<string, boolean>>({
  "skill-builtin": false,
  "skill-nonbuiltin": true, // default collapsed
  "plugin-enabled": false,
  "plugin-disabled": true,  // default collapsed
});

function toggleSection(key: string) {
  sections.value[key] = !sections.value[key];
}

// Data
const skills = ref<SkillInfo[]>([]);
const plugins = ref<PluginInfo[]>([]);

const filteredSkills = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return skills.value;
  return skills.value.filter(
    s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.source || "").toLowerCase().includes(q)
  );
});

const filteredPlugins = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return plugins.value;
  return plugins.value.filter(
    p =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q)
  );
});

const builtinSkills = computed(() => filteredSkills.value.filter(s => s.bundled));
const nonBuiltinSkills = computed(() => filteredSkills.value.filter(s => !s.bundled));
const enabledPlugins = computed(() => filteredPlugins.value.filter(p => p.enabled));
const disabledPlugins = computed(() => filteredPlugins.value.filter(p => !p.enabled));

const skillStats = computed(() => {
  const total = skills.value.length;
  const ready = skills.value.filter(s => s.eligible).length;
  return { total, ready };
});

const pluginStats = computed(() => {
  const total = plugins.value.length;
  const enabled = plugins.value.filter(p => p.enabled).length;
  return { total, enabled };
});

async function loadSkills() {
  try {
    const data = await gateway.runAction(["skills", "list", "--json"]);
    const parsed = JSON.parse(typeof data === "string" ? data : data.stdout || "{}");
    skills.value = (parsed.skills || []).map((s: Record<string, unknown>) => ({
      name: s.name as string,
      description: s.description as string || "",
      emoji: (s.emoji as string) || "",
      eligible: s.eligible as boolean,
      disabled: s.disabled as boolean,
      source: s.source as string || "",
      bundled: s.bundled as boolean,
      homepage: s.homepage as string || "",
      missing: (s.missing as SkillInfo["missing"]) || { bins: [], anyBins: [], env: [], config: [], os: [] },
    }));
  } catch (err) {
    console.error("Failed to load skills:", err);
    skills.value = [];
  }
}

async function loadPlugins() {
  try {
    const data = await gateway.runAction(["plugins", "list", "--json"]);
    const parsed = JSON.parse(typeof data === "string" ? data : data.stdout || "{}");
    plugins.value = (parsed.plugins || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string || (p.id as string),
      description: p.description as string || "",
      format: p.format as string || "",
      enabled: p.enabled as boolean,
      status: p.status as string || "",
      version: p.version as string || "",
      origin: p.origin as string || "",
    }));
  } catch (err) {
    console.error("Failed to load plugins:", err);
    plugins.value = [];
  }
}

async function refresh() {
  loading.value = true;
  await Promise.all([loadSkills(), loadPlugins()]);
  loading.value = false;
}

async function togglePlugin(plugin: PluginInfo, enable: boolean) {
  const action = enable ? "enable" : "disable";
  // Optimistic update
  plugin.enabled = enable;
  plugins.value = [...plugins.value];
  try {
    await gateway.runAction(["plugins", action, plugin.id]);
    await loadPlugins();
  } catch (err) {
    console.error(`Failed to ${action} plugin:`, err);
    plugin.enabled = !enable;
    plugins.value = [...plugins.value];
  }
}

onMounted(() => refresh());
</script>

<style scoped>
.skills-toolbar {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 0.5rem;
}
.skills-tabs {
  display: flex; gap: 2px;
  background: var(--surface0);
  border-radius: var(--radius-md);
  padding: 2px;
}
.tab-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 14px;
  font-size: 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.12s;
}
.tab-btn.active {
  background: var(--surface1);
  color: var(--text-primary);
}
.tab-btn:hover:not(.active) {
  color: var(--text-primary);
}

/* 折叠分区 */
.section-card {
  margin-bottom: 6px;
}
.section-header {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px;
  background: var(--surface0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}
.section-header:hover {
  background: var(--surface1);
}
.section-title {
  font-weight: 600;
  font-size: 13px;
  flex: 1;
}

/* 卡片网格 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 6px;
  padding: 6px;
  background: var(--surface0);
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}
.card-grid-narrow {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

/* 技能卡片 */
.skill-card {
  display: flex; flex-direction: column;
  padding: 10px 12px;
}
.skill-card-body {
  flex: 1;
}
.skill-card-header {
  display: flex; align-items: flex-start; gap: 6px;
  margin-bottom: 4px;
}
.skill-card-footer {
  display: flex; justify-content: space-between; align-items: center;
  border-top: 1px solid var(--surface0);
  padding-top: 6px;
  margin-top: 6px;
}
.skill-name {
  font-weight: 600;
  font-size: 12px;
  flex: 1;
  word-break: break-all;
}
.skill-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
  margin-bottom: 6px;
}
.skill-missing {
  display: flex; flex-wrap: wrap; align-items: center; gap: 3px;
  padding: 3px 5px;
  background: rgba(243, 139, 168, 0.08);
  border-radius: var(--radius-sm);
}

/* 插件卡片 */
.plugin-card {
  display: flex; flex-direction: column;
  padding: 10px 12px;
}
.plugin-card-header {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 4px;
}
.plugin-name {
  font-weight: 600;
  font-size: 12px;
  flex: 1;
}
.plugin-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
  margin-bottom: 6px;
}
.plugin-meta {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: 6px;
}
.plugin-actions {
  border-top: 1px solid var(--surface0);
  padding-top: 6px;
  display: flex; gap: 4px;
}

/* 通用 */
.chip {
  display: inline-flex;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface0);
  font-size: 10px;
  white-space: nowrap;
}
.chip-error {
  background: rgba(243, 139, 168, 0.15);
  color: var(--red);
}
.link-muted {
  color: var(--text-muted);
  text-decoration: none;
  display: inline-flex; align-items: center; gap: 2px;
}
.link-muted:hover {
  color: var(--text-primary);
}
</style>
