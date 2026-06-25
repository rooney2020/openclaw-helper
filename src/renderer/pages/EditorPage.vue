<template>
  <div class="editor-layout">
    <!-- 上方 tab 栏：显示 6 个核心文件 -->
    <div class="file-tabs">
      <div
        v-for="(f, i) in tabs"
        :key="f.path"
        class="file-tab"
        :class="{ active: activeIndex === i, loading: loadingSet.has(f.path) }"
        @click="switchTab(i)"
      >
        <Icon name="file-text" :size="12" />
        <span class="truncate">{{ f.name }}</span>
        <div v-if="loadingSet.has(f.path)" class="tab-spinner" />

      </div>
      <div class="file-tab-placeholder" />
    </div>

    <!-- 内容区域 -->
    <div v-if="!currentFile" class="editor-empty">
      <Icon name="file-text" :size="40" style="opacity:0.3" />
      <p class="text-muted text-sm">没有文件</p>
    </div>
    <template v-else>
      <!-- 工具栏 -->
      <div class="editor-toolbar">
        <span class="text-xs truncate" style="font-weight:600;max-width:200px">{{ currentFile.name }}</span>
        <span class="text-xs text-muted truncate" style="max-width:300px">{{ currentFile.path }}</span>
        <div style="flex:1" />
        <div class="tab-group">
          <button class="tab-btn" :class="{ active: editTab === 'preview' }" @click="editTab = 'preview'">
            <Icon name="eye" :size="12" /> 预览
          </button>
          <button class="tab-btn" :class="{ active: editTab === 'edit' }" @click="editTab = 'edit'">
            <Icon name="edit" :size="12" /> 编辑
          </button>
        </div>
        <span v-if="dirtySet.has(currentFile.path)" class="badge badge-warning" style="font-size:10px">未保存</span>
        <button class="btn btn-sm btn-primary" :disabled="!dirtySet.has(currentFile.path)" @click="saveFile">
          <Icon name="save" :size="12" /> 保存
        </button>
      </div>

      <!-- 编辑器 / 预览 -->
      <textarea
        v-if="editTab === 'edit'"
        v-model="contents[currentFile.path]"
        class="editor-textarea"
        spellcheck="false"
        @keydown.tab.prevent="onTab"
        @input="onContentChange"
      />
      <div
        v-else
        class="editor-preview markdown-preview"
        v-html="previewHtml"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { marked } from "marked";
marked.use({ async: false });
import Icon from "../components/Icon.vue";
import { useGatewayStore } from "../stores/gateway";

const gateway = useGatewayStore();

// 6 个核心文件（按指定顺序）
const FILE_NAMES = ["AGENTS.md", "SOUL.md", "TOOLS.md", "IDENTITY.md", "USER.md", "MEMORY.md"];

interface TabItem {
  name: string;
  path: string;
}

const tabs = ref<TabItem[]>([]);
const activeIndex = ref(0);
const contents = ref<Record<string, string>>({});
const originals = ref<Record<string, string>>({});
const dirtySet = ref<Set<string>>(new Set());
const loadingSet = ref<Set<string>>(new Set());
const editTab = ref<"preview" | "edit">("preview");

const currentFile = computed(() => tabs.value[activeIndex.value] || null);
const previewHtml = computed(() => {
  if (!currentFile.value) return "";
  const c = contents.value[currentFile.value.path] || "";
  try { return marked.parse(c, { breaks: true, gfm: true }); }
  catch { return '<p class="text-danger">渲染失败</p>'; }
});

function resolveFilePaths(files: { name: string; path: string }[]): TabItem[] {
  const map = new Map<string, string>();
  for (const f of files) map.set(f.name, f.path);
  const result: TabItem[] = [];
  for (const name of FILE_NAMES) {
    const fp = map.get(name);
    if (fp) result.push({ name, path: fp });
  }
  // 也加入额外的 .md 文件
  for (const f of files) {
    if (f.name.endsWith('.md') && !FILE_NAMES.includes(f.name)) {
      result.push({ name: f.name, path: f.path });
    }
  }
  return result;
}

async function loadFileContent(path: string) {
  loadingSet.value.add(path);
  try {
    const c = await gateway.readFile(path);
    contents.value[path] = c;
    originals.value[path] = c;
  } catch {
    contents.value[path] = "";
    originals.value[path] = "";
  } finally {
    loadingSet.value.delete(path);
  }
}

function onContentChange() {
  if (!currentFile.value) return;
  const p = currentFile.value.path;
  if (contents.value[p] !== originals.value[p]) {
    dirtySet.value.add(p);
  } else {
    dirtySet.value.delete(p);
  }
}

async function switchTab(idx: number) {
  if (activeIndex.value === idx) return;
  activeIndex.value = idx;
  editTab.value = "preview";
  const f = currentFile.value;
  if (f && !(f.path in contents.value)) {
    await loadFileContent(f.path);
  }
}

function closeTab(idx: number) {
  const f = tabs.value[idx];
  if (!f) return;
  tabs.value.splice(idx, 1);
  delete contents.value[f.path];
  delete originals.value[f.path];
  dirtySet.value.delete(f.path);
  loadingSet.value.delete(f.path);
  if (tabs.value.length === 0) {
    activeIndex.value = 0;
  } else if (idx <= activeIndex.value) {
    activeIndex.value = Math.max(0, activeIndex.value - 1);
  }
}

async function saveFile() {
  if (!currentFile.value) return;
  const p = currentFile.value.path;
  try {
    await gateway.writeFile(p, contents.value[p]);
    originals.value[p] = contents.value[p];
    dirtySet.value.delete(p);
  } catch (err: unknown) {
    alert(`保存失败: ${(err as Error).message}`);
  }
}

function onTab(e: KeyboardEvent) {
  const ta = e.target as HTMLTextAreaElement;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  if (!currentFile.value) return;
  const p = currentFile.value.path;
  const v = contents.value[p] || "";
  contents.value[p] = v.substring(0, start) + "  " + v.substring(end);
  nextTick(() => {
    ta.selectionStart = ta.selectionEnd = start + 2;
  });
  onContentChange();
}

// 监听工作区文件变化，自动构建 tab
watch(
  () => gateway.workspaceFiles,
  (files) => {
    if (!files.length) return;
    const resolved = resolveFilePaths(files);
    if (!tabs.value.length) {
      tabs.value = resolved;
      // 默认打开第一个 tab 并加载内容
      if (resolved.length > 0) {
        loadFileContent(resolved[0].path);
      }
    } else {
      // 保持已有 tabs，添加新发现的文件
      const existingPaths = new Set(tabs.value.map(t => t.path));
      for (const t of resolved) {
        if (!existingPaths.has(t.path)) {
          tabs.value.push(t);
        }
      }
    }
  },
  { immediate: true }
);

onMounted(async () => {
  if (!gateway.workspaceFiles.length) {
    await gateway.fetchWorkspaceFiles();
  }
});
</script>

<style scoped>
.editor-layout {
  display: flex; flex-direction: column; height: calc(100vh - 120px); min-height: 0;
}
.file-tabs {
  display: flex; gap: 0; border-bottom: 1px solid var(--border);
  overflow-x: auto; flex-shrink: 0;
}
.file-tab {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 10px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border); border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: var(--mantle); color: var(--text-muted);
  white-space: nowrap; flex-shrink: 0;
}
.file-tab.active {
  background: var(--base); color: var(--text); border-bottom-color: var(--base);
}

.file-tab-placeholder { flex: 1; border-bottom: 1px solid var(--border); }
.tab-spinner {
  width: 10px; height: 10px; border: 2px solid var(--surface1);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin 0.6s linear infinite; margin-left: 2px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.editor-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px; flex: 1;
  color: var(--text-muted); opacity: 0.5;
}
.editor-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0; flex-shrink: 0;
}
.tab-group { display: flex; gap: 0; }
.tab-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 12px; font-size: 12px; border: 1px solid var(--border);
  background: var(--mantle); color: var(--text-muted); cursor: pointer;
}
.tab-btn:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.tab-btn:last-child { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.tab-btn.active { background: var(--accent); color: var(--base); border-color: var(--accent); }
.editor-textarea {
  flex: 1; min-height: 0;
  font-family: var(--font-mono); font-size: 13px; line-height: 1.5;
  background: var(--base); border: 1px solid var(--border);
  color: var(--text); padding: 12px; resize: none;
  outline: none; border-radius: var(--radius-md);
  tab-size: 2;
}
.editor-textarea:focus { border-color: var(--accent); }
.editor-preview {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 12px; background: var(--base);
  border: 1px solid var(--border); border-radius: var(--radius-md);
}
</style>
