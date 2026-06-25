<template>
  <div class="notes-layout">
    <!-- 左侧：每日记忆笔记列表 -->
    <aside class="notes-sidebar">
      <div class="notes-sidebar-header">
        <Icon name="file-text" :size="14" />
        <span class="text-xs" style="font-weight:600">{{ noteFiles.length }} 篇记忆笔记</span>
        <div style="flex:1" />
        <button class="btn btn-sm btn-icon" @click="loadNotes" title="刷新">
          <Icon name="refresh" :size="12" />
        </button>
      </div>
      <div v-if="loading" class="notes-loading">
        <div class="spinner" style="width:16px;height:16px" />
        <span class="text-xs text-muted">加载中…</span>
      </div>
      <div v-else-if="!noteFiles.length" class="notes-loading">
        <span class="text-xs text-muted">暂无记忆笔记</span>
      </div>
      <div v-else class="notes-file-list">
        <div
          v-for="f in noteFiles"
          :key="f.path"
          class="notes-file-item"
          :class="{ active: selectedNote === f.path }"
          @click="selectNote(f)"
        >
          <Icon name="file-text" :size="14" />
          <span class="truncate text-xs">{{ f.name.replace('.md', '') }}</span>
          <span class="file-size text-xs text-muted">{{ (f.size / 1024).toFixed(1) }}K</span>
        </div>
      </div>
    </aside>

    <!-- 右侧：笔记内容 -->
    <main class="notes-content">
      <div v-if="!selectedNote" class="notes-empty">
        <Icon name="file-text" :size="40" style="opacity:0.3" />
        <p class="text-muted text-sm">从左侧选择一篇记忆笔记</p>
      </div>
      <template v-else>
        <div class="notes-toolbar">
          <span class="text-xs truncate" style="font-weight:600;max-width:200px">{{ selectedFileName }}</span>
          <div style="flex:1" />
          <div class="tab-group">
            <button class="tab-btn" :class="{ active: tab === 'preview' }" @click="tab = 'preview'">
              <Icon name="eye" :size="12" /> 预览
            </button>
            <button class="tab-btn" :class="{ active: tab === 'edit' }" @click="tab = 'edit'">
              <Icon name="edit" :size="12" /> 编辑
            </button>
          </div>
          <span v-if="hasChanges" class="badge badge-warning" style="font-size:10px">未保存</span>
          <button class="btn btn-sm btn-primary" :disabled="!hasChanges" @click="saveNote">
            <Icon name="save" :size="12" /> 保存
          </button>
        </div>

        <div v-if="contentLoading" class="content-mid">
          <div class="spinner" style="width:16px;height:16px" />
        </div>
        <textarea
          v-else-if="tab === 'edit'"
          v-model="content"
          class="notes-editor"
          spellcheck="false"
        />
        <div
          v-else
          class="notes-preview markdown-preview"
          v-html="html"
        />
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { marked } from "marked";
marked.use({ async: false });
import Icon from "../components/Icon.vue";
import { useGatewayStore } from "../stores/gateway";

const gateway = useGatewayStore();
const loading = ref(true);
const contentLoading = ref(false);

const noteFiles = computed(() => gateway.memoryFiles);

const selectedNote = ref("");
const content = ref("");
const original = ref("");
const tab = ref<"preview" | "edit">("preview");

const hasChanges = computed(() => content.value !== original.value);
const selectedFileName = computed(() => {
  const f = noteFiles.value.find(x => x.path === selectedNote.value);
  return f?.name || selectedNote.value.split('/').pop() || '';
});
const html = computed(() => {
  try { return marked.parse(content.value, { breaks: true, gfm: true }); }
  catch { return '<p class="text-danger">渲染失败</p>'; }
});

async function loadNotes() {
  loading.value = true;
  try {
    await gateway.fetchWorkspaceFiles();
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

async function selectNote(f: { name: string; path: string }) {
  selectedNote.value = f.path;
  tab.value = "preview";
  contentLoading.value = true;
  try {
    const result = await gateway.readFile(f.path);
    content.value = result;
    original.value = result;
  } catch {
    content.value = "";
    original.value = "";
  } finally {
    contentLoading.value = false;
  }
}

async function saveNote() {
  try {
    await gateway.writeFile(selectedNote.value, content.value);
    original.value = content.value;
  } catch (err: unknown) {
    alert(`保存失败: ${(err as Error).message}`);
  }
}

onMounted(() => {
  loadNotes();
});
</script>

<style scoped>
.notes-layout {
  display: flex; height: calc(100vh - 120px); gap: 8px; min-height: 0;
}
.notes-sidebar {
  width: 200px; min-width: 160px;
  background: var(--mantle); border: 1px solid var(--border);
  border-radius: var(--radius-md); display: flex; flex-direction: column;
  overflow: hidden; flex-shrink: 0;
}
.notes-sidebar-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.notes-loading {
  display: flex; align-items: center; gap: 6px; justify-content: center; padding: 2rem 0;
}
.notes-file-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.notes-file-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; cursor: pointer; font-size: 12px;
  border-left: 3px solid transparent;
}
.notes-file-item:hover { background: var(--surface0); }
.notes-file-item.active {
  background: var(--surface1); border-left-color: var(--accent); color: var(--accent);
}
.file-size { margin-left: auto; flex-shrink: 0; }
.notes-content {
  flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0;
}
.notes-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px; flex: 1;
  color: var(--text-muted); opacity: 0.5;
}
.notes-toolbar {
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0; padding: 0 0 6px 0;
  border-bottom: 1px solid var(--border); margin-bottom: 6px;
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
.content-mid {
  display: flex; align-items: center; justify-content: center; flex: 1;
}
.notes-editor {
  flex: 1; min-height: 0;
  font-family: var(--font-mono); font-size: 13px; line-height: 1.6;
  background: var(--base); border: 1px solid var(--border);
  color: var(--text); padding: 12px; resize: none;
  outline: none; border-radius: var(--radius-md);
}
.notes-editor:focus { border-color: var(--accent); }
.notes-preview {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 12px; background: var(--base);
  border: 1px solid var(--border); border-radius: var(--radius-md);
}
</style>
