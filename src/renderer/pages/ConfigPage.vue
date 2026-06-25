<template>
  <div class="config-wrapper">
    <div class="config-toolbar">
      <span class="text-xs" style="font-weight:600">配置文件</span>
      <span class="text-xs text-muted">~/.openclaw/config.yaml</span>
      <div style="flex:1" />
      <span class="badge" :class="validJson ? 'badge-success' : 'badge-danger'" style="font-size:10px">
        {{ validJson ? 'JSON 有效' : 'JSON 无效' }}
      </span>
      <button class="btn btn-sm btn-primary" :disabled="!validJson" @click="saveConfig">
        <Icon name="save" :size="12" /> 保存
      </button>
      <button class="btn btn-sm" @click="validateConfig">
        <Icon name="check" :size="12" /> 配置验证
      </button>
      <button class="btn btn-sm btn-icon" @click="loadConfig" title="刷新">
        <Icon name="refresh" :size="12" />
      </button>
    </div>

    <div class="editor-container">
      <pre
        ref="editorRef"
        class="config-editor"
        contenteditable
        spellcheck="false"
        @input="onEdit"
        @keydown="handleKeydown"
      ><code v-html="highlightedJson" /></pre>
    </div>
    <div v-if="validateOutput" class="validate-output" :class="{ 'is-error': validateIsError }">
      <pre>{{ validateOutput }}</pre>
      <button class="btn btn-sm btn-icon" @click="validateOutput = ''" title="关闭" style="position:absolute;top:4px;right:4px">
        <Icon name="x" :size="12" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import Icon from "../components/Icon.vue";
import { useGatewayStore } from "../stores/gateway";

const gateway = useGatewayStore();
const configText = ref("");
const validJson = ref(true);
const editorRef = ref<HTMLPreElement | null>(null);
const validateOutput = ref("");
const validateIsError = ref(false);
// Internal flag to prevent re-triggering on programmatic changes
let isRehighlighting = false;

function highlightJson(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("(?:[^"\\]|\\.)*")|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b|([{}[\]])/g,
      (match, str, num, boolnull, brace) => {
        if (str) return `<span style="color:#a6e3a1">${str}</span>`;
        if (num) return `<span style="color:#fab387">${num}</span>`;
        if (boolnull) return `<span style="color:#cba6f7">${boolnull}</span>`;
        if (brace) return `<span style="color:#89b4fa">${brace}</span>`;
        return match;
      }
    );
}

const highlightedJson = computed(() => highlightJson(configText.value));

function saveCursor(el: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return "";
  const range = sel.getRangeAt(0);
  const pre = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement?.closest("pre")
    : (range.startContainer as HTMLElement).closest("pre");
  if (!pre) return "";
  // Walk text nodes to find offset
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT, null);
  let charIndex = 0;
  let found = false;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node === range.startContainer) {
      charIndex += range.startOffset;
      found = true;
      break;
    }
    charIndex += node.textContent?.length || 0;
  }
  return found ? String(charIndex) : "";
}

function restoreCursor(el: HTMLElement, saved: string) {
  if (!saved) return;
  const targetIndex = parseInt(saved, 10);
  if (isNaN(targetIndex)) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  let charIndex = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.textContent?.length || 0;
    if (charIndex + len >= targetIndex) {
      const offset = targetIndex - charIndex;
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.setStart(node, Math.min(offset, len));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return;
    }
    charIndex += len;
  }
  // At end
  if (node) {
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.setStart(node, node.textContent?.length || 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

function getPlainText(el: HTMLElement): string {
  return el.textContent || "";
}

function onEdit() {
  if (isRehighlighting) return;
  const el = editorRef.value;
  if (!el) return;
  // Save cursor position
  const saved = saveCursor(el);
  // Get plain text from contenteditable
  configText.value = getPlainText(el);
  validateJson();
  // Re-highlight — restore cursor after next tick
  nextTick(() => {
    if (!editorRef.value) return;
    isRehighlighting = true;
    // Reset innerHTML to trigger re-render with highlighted code
    const codeEl = editorRef.value.querySelector("code");
    if (codeEl) {
      codeEl.innerHTML = highlightedJson.value;
    }
    restoreCursor(editorRef.value, saved);
    isRehighlighting = false;
  });
}

function validateJson() {
  try {
    JSON.parse(configText.value);
    validJson.value = true;
  } catch {
    validJson.value = false;
  }
}

async function loadConfig() {
  try {
    const r = await gateway.readConfig();
    configText.value = r.content || "";
    validateJson();
    // Force re-highlight after data loads
    await nextTick();
    onEdit();
  } catch {
    configText.value = "# 无法加载配置";
    validJson.value = false;
  }
}

async function saveConfig() {
  if (!validJson.value) return;
  try {
    await gateway.writeConfig(configText.value);
  } catch (err: unknown) {
    alert(`保存失败: ${(err as Error).message}`);
  }
}

async function validateConfig() {
  validateOutput.value = "";
  validateIsError.value = false;
  try {
    const result = await gateway.runAction(["config", "validate"]);
    const txt = typeof result === 'string' ? result : (result.stdout || result.stderr || JSON.stringify(result, null, 2));
    validateOutput.value = txt;
    validateIsError.value = txt.includes("❌") || txt.includes("error") || txt.toLowerCase().includes("invalid");
  } catch (err: unknown) {
    validateOutput.value = `❌ 验证失败: ${(err as Error).message}`;
    validateIsError.value = true;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveConfig();
  }
  // Tab: insert 2 spaces
  if (e.key === "Tab") {
    e.preventDefault();
    const el = editorRef.value;
    if (!el) return;
    // Insert text at cursor
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode("  "));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    // Trigger input
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

onMounted(() => {
  loadConfig();
});
</script>

<style scoped>
.config-wrapper {
  display: flex; flex-direction: column;
  height: calc(100vh - 120px); min-height: 0;
}
.config-toolbar {
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0; padding-bottom: 6px;
  border-bottom: 1px solid var(--border); margin-bottom: 6px;
}
.editor-container {
  flex: 1; min-height: 0; overflow: hidden;
  background: var(--base);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.config-editor {
  width: 100%; height: 100%; margin: 0; padding: 12px;
  font-family: var(--font-mono); font-size: 13px; line-height: 1.5;
  white-space: pre; word-wrap: normal; overflow: auto;
  tab-size: 2; outline: none;
  color: var(--text); background: transparent;
  -webkit-user-modify: read-write-plaintext-only;
  user-modify: read-write-plaintext-only;
}
.config-editor code {
  font-family: inherit; background: transparent;
  color: inherit;
}
.validate-output {
  position: relative;
  flex-shrink: 0;
  margin-top: 6px;
  border: 1px solid var(--green);
  border-radius: var(--radius-md);
  background: var(--surface0);
  max-height: 150px;
  overflow-y: auto;
}
.validate-output.is-error {
  border-color: var(--red);
}
.validate-output pre {
  margin: 0; padding: 8px 28px 8px 8px;
  font-family: var(--font-mono); font-size: 11px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-all;
  color: var(--text-primary);
}
</style>
