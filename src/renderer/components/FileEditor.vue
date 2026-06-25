<template>
  <div class="file-editor">
    <div class="editor-toolbar">
      <span class="editor-filename text-mono text-sm">{{ filename }}</span>
      <span v-if="loading" class="spinner" style="width:14px;height:14px;border-width:1.5px" />
      <span v-else class="text-xs text-muted">{{ sizeLabel }}</span>
      <div class="editor-toolbar-spacer" />
      <button v-if="dirty" class="btn btn-primary btn-sm" @click="emit('save')">
        <Icon name="save" :size="14" /> 保存
      </button>
      <button v-else class="btn btn-sm" @click="emit('save')">
        <Icon name="save" :size="14" /> 保存
      </button>
    </div>
    <!-- Tab 切换 -->
    <div v-if="isMarkdown" class="editor-tabs">
      <button
        class="editor-tab"
        :class="{ active: tab === 'preview' }"
        @click="tab = 'preview'"
      >
        <Icon name="eye" :size="14" /> 预览
      </button>
      <button
        class="editor-tab"
        :class="{ active: tab === 'source' }"
        @click="tab = 'source'"
      >
        <Icon name="edit" :size="14" /> 原文
      </button>
    </div>
    <!-- 预览模式 -->
    <div
      v-if="isMarkdown && tab === 'preview'"
      class="markdown-preview"
      v-html="rendered"
    />
    <!-- 编辑模式 -->
    <textarea
      v-show="!isMarkdown || tab === 'source'"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      class="editor-textarea"
      :style="{ minHeight: minHeight + 'px' }"
      spellcheck="false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { marked } from "marked";

// Force sync mode
marked.use({ async: false });
import Icon from "./Icon.vue";

const props = defineProps<{
  modelValue: string;
  filename: string;
  dirty?: boolean;
  loading?: boolean;
  size?: number;
  minHeight?: number;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
}>();

const tab = ref<"preview" | "source">("preview");

const isMarkdown = computed(() =>
  props.filename.endsWith(".md") || props.filename.endsWith(".markdown")
);

const rendered = computed(() => {
  try {
    return marked.parse(props.modelValue, { breaks: true, gfm: true }) as string;
  } catch {
    return `<p class="text-danger">渲染失败</p>`;
  }
});

const sizeLabel = computed(() => {
  if (props.size === undefined) return "";
  return props.size < 1024
    ? `${props.size} B`
    : `${(props.size / 1024).toFixed(1)} KB`;
});
</script>

<style scoped>
.file-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--mantle);
  border: 1px solid var(--border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  flex-shrink: 0;
}
.editor-filename {
  color: var(--subtext1);
  font-weight: 600;
}
.editor-toolbar-spacer { flex: 1; }

/* Tab 切换 */
.editor-tabs {
  display: flex;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  background: var(--crust);
  flex-shrink: 0;
}
.editor-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.editor-tab:hover {
  color: var(--subtext1);
  background: var(--mantle);
}
.editor-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  background: var(--bg-primary);
}

/* 编辑器 textarea */
.editor-textarea {
  flex: 1;
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--bg-primary);
  color: var(--subtext0);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  padding: 12px;
  resize: none;
  tab-size: 2;
}
.editor-textarea:focus {
  border-color: var(--accent);
  outline: none;
}

/* Markdown 预览区 */
.markdown-preview {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--bg-primary);
  padding: 16px 20px;
}
</style>
