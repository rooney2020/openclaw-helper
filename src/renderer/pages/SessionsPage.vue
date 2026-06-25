<template>
  <div>
    <div style="display:flex;gap:8px;margin-bottom:0.5rem;align-items:center;flex-wrap:wrap">
      <select v-model="selectedAgent" @change="loadSessions" style="max-width:160px" class="select-sm">
        <option v-for="a in gateway.agents" :key="a.id" :value="a.id">{{ a.id }}</option>
      </select>
      <input
        v-model="searchQuery"
        placeholder="搜索消息内容或会话…"
        class="input-sm"
        style="width:180px"
      />
      <label class="filter-label" title="只显示包含用户或助手消息的会话">
        <input type="checkbox" v-model="filterHasMessages" />
        <span>仅显示有对话</span>
      </label>
      <label class="filter-label" title="隐藏助手消息中的工具调用">
        <input type="checkbox" v-model="hideToolCalls" />
        <span>隐藏工具调用</span>
      </label>
      <label class="filter-label" title="隐藏系统事件（模型切换、思维级别等）">
        <input type="checkbox" v-model="hideSystemEvents" />
        <span>隐藏系统消息</span>
      </label>
      <label class="filter-label" title="隐藏助手消息中的思考过程（thinking 块）">
        <input type="checkbox" v-model="hideThinking" />
        <span>隐藏思考</span>
      </label>
      <button class="btn btn-sm" @click="gateway.triggerScan(selectedAgent)" title="重新扫描会话文件">
        <Icon name="refresh" :size="14" /> 扫描
      </button>
      <span class="text-xs text-muted">{{ filteredSessions.length }}/{{ gateway.sessions.length }} 个会话</span>
    </div>

    <div v-if="gateway.sessionsLoading" class="card">
      <div style="display:flex;align-items:center;gap:8px"><div class="spinner" /> 加载会话列表…</div>
    </div>

    <template v-else-if="gateway.sessions.length">
      <div class="sessions-layout">
        <!-- 左侧：会话列表 -->
        <aside class="sessions-list">
          <div
            v-for="s in filteredSessions"
            :key="s.key"
            class="session-item"
            :class="{ active: viewingKey === s.key, 'archived-item': s.isArchived }"
            @click="viewSession(s)"
          >
            <div class="session-item-key truncate text-sm">
              <Icon name="file-text" :size="12" />
              {{ s.key.split('-')[0] }}…
              <span v-if="s.isArchived" class="archived-badge">归档</span>
            </div>
            <div v-if="s.title" class="session-item-desc truncate text-xs">{{ s.title }}</div>
            <div class="session-item-meta text-xs text-muted">
              {{ formatSize(s.fileSizeBytes) }} · {{ formatTime(s.lastModified) }}
            </div>
            <div v-if="searchQuery && contentSearchResults && contentSearchMatches.has(s.key)" class="session-match-count text-xs" title="点击查看会话中的匹配内容">
              <Icon name="search" :size="10" />
            </div>
          </div>
        </aside>

        <!-- 右侧：对话界面 -->
        <main class="session-content" ref="contentRef">
          <div v-if="!viewingKey" class="session-empty-select">
            <Icon name="sessions" :size="48" style="opacity:0.3" />
            <p class="text-muted">选择左侧会话查看对话</p>
          </div>
          <template v-else>
            <div class="chat-header">
              <Icon name="file-text" :size="14" />
              <span class="chat-file">{{ viewingKey.slice(0, 20) }}…</span>
              <span class="text-xs text-muted">{{ msgCount }} 条消息</span>
              <template v-if="searchQuery && activeMatchCount > 0">
                <span class="search-match-info text-xs">
                  {{ activeMatchIndex + 1 }}/{{ activeMatchCount }} 匹配
                </span>
                <button class="btn btn-xs" @click="scrollToMatch(-1)" title="上一个匹配">
                  <Icon name="chevron-up" :size="12" />
                </button>
                <button class="btn btn-xs" @click="scrollToMatch(1)" title="下一个匹配">
                  <Icon name="chevron-down" :size="12" />
                </button>
              </template>
              <div style="flex:1" />
              <div class="export-dropdown" ref="exportRef">
                <button class="btn btn-sm" @click="toggleExportMenu">
                  <Icon name="download" :size="12" /> 导出
                </button>
                <div v-if="showExportMenu" class="export-menu">
                  <button class="export-item" @click="exportSession('markdown')">
                    <Icon name="file-text" :size="12" /> 导出 Markdown
                  </button>
                  <button class="export-item" @click="exportSession('json')">
                    <Icon name="file" :size="12" /> 导出 JSON
                  </button>
                  <button class="export-item" @click="exportSession('text')">
                    <Icon name="terminal" :size="12" /> 导出纯文本
                  </button>
                </div>
              </div>
              <button class="btn btn-sm" @click="scrollToEnd()" title="跳到底部（最新消息）">
                <Icon name="chevron-down" :size="12" /> 底部
              </button>
              <button class="btn btn-sm" @click="scrollToTop()" title="跳到顶部（最早消息）">
                <Icon name="chevron-up" :size="12" /> 顶部
              </button>
              <button class="btn btn-sm btn-danger" @click="confirmDelete">
                <Icon name="trash" :size="12" />
              </button>
            </div>

            <!-- 错误/提示信息 -->
            <div v-if="sessionError" class="session-error-banner">
              <Icon name="alert-circle" :size="14" />
              {{ sessionError }}
              <button class="btn btn-sm" style="margin-left:auto" @click="sessionError = ''">
                <Icon name="x" :size="11" />
              </button>
            </div>

            <div class="chat-messages" ref="msgListRef" @scroll="onScrollHandler">
              <!-- Intersection sentinel: 滚动到顶部时触发加载 -->
              <div ref="topSentinel" class="sentinel" />

              <div v-if="loadingMore" class="load-indicator"><div class="spinner" /> 加载中…</div>

              <div
                v-for="(msg, idx) in displayMessages"
                :key="msg.id || idx"
                class="chat-bubble-row"
                :class="[msg.isInfo ? 'info-row' : 'role-' + msg.role]"
              >
                <template v-if="msg.isInfo">
                  <div class="chat-avatar info-avatar">
                    <Icon name="info" :size="14" />
                  </div>
                  <div class="chat-bubble info-bubble">
                    <div class="chat-bubble-meta">
                      <span class="chat-bubble-label text-muted">{{ msg.summary }}</span>
                      <span v-if="msg.time" class="text-xs text-muted">{{ msg.time }}</span>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div v-if="msg.role === 'assistant'" class="chat-avatar assistant-avatar">
                    <Icon name="bot" :size="18" />
                  </div>
                  <div v-else class="chat-avatar user-avatar">
                    <Icon name="user" :size="18" />
                  </div>
                  <div class="chat-bubble">
                    <div class="chat-bubble-meta">
                      <span class="chat-bubble-label">{{ roleLabel(msg.role) }}</span>
                      <span v-if="msg.time" class="text-xs text-muted">{{ msg.time }}</span>
                      <span v-if="msg.model" class="text-xs text-muted" style="margin-left:4px">· {{ msg.model.split('/').pop() }}</span>
                    </div>
                    <div class="chat-bubble-body markdown-preview" v-html="msg.html" />
                  </div>
                </template>
              </div>

              <div v-if="allLoaded && messages.length > 0" class="load-more-hint text-xs text-muted">共 {{ totalLines }} 条记录 · {{ displayMessages.filter(m => !m.isInfo).length }} 条消息</div>
            </div>
          </template>
        </main>
      </div>
    </template>

    <div v-else class="card">
      <p class="text-muted text-sm">未找到会话文件。</p>
    </div>

    <ConfirmDialog
      :visible="showDeleteConfirm"
      title="删除会话"
      :message="`确定要删除会话 ${viewingKey?.slice(0,16)}…？文件将移至备份。`"
      confirm-text="删除"
      :danger="true"
      @confirm="doDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onUnmounted } from "vue";
import { marked } from "marked";
marked.use({ async: false });

import Icon from "../components/Icon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import { useGatewayStore, type SessionInfo } from "../stores/gateway";

const gateway = useGatewayStore();
const selectedAgent = ref("");
const showDeleteConfirm = ref(false);
const viewingSession = ref<SessionInfo | null>(null);
const viewingKey = computed(() => viewingSession.value?.key || "");

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  html: string;
  time: string;
  model: string;
  summary: string;
  isInfo?: boolean;
  /** Raw content blocks (if parsed from array) for re-processing */
  rawBlocks?: any[] | null;
}

const messages = ref<ChatMessage[]>([]);
const totalLines = ref(0);
const loadedUpTo = ref(0);
const msgCount = computed(() => messages.value.filter(m => !m.isInfo).length);
const allLoaded = computed(() => loadedUpTo.value <= 0 && !loadingMore.value);

const loadingMore = ref(false);

const contentRef = ref<HTMLElement | null>(null);
const msgListRef = ref<HTMLElement | null>(null);
const topSentinel = ref<HTMLElement | null>(null);
const sessionError = ref<string>('');

const searchQuery = ref('');
const filterHasMessages = ref(true);
const hideToolCalls = ref(localStorage.getItem('oc-helper-hideToolCalls') === 'true');
const hideSystemEvents = ref(localStorage.getItem('oc-helper-hideSystemEvents') === 'true');
const hideThinking = ref(localStorage.getItem('oc-helper-hideThinking') === 'true');
// Each result: {key, matchCount, lineNumbers[]}
const contentSearchResults = ref<Array<{key: string; matchCount: number; lineNumbers: number[]}> | null>(null);
const activeMatchIndex = ref(0);
let searchTimer: ReturnType<typeof setTimeout>;

// Map session key → match count
const contentSearchMatches = computed(() => {
  const map = new Map<string, number>();
  if (!contentSearchResults.value) return map;
  for (const r of contentSearchResults.value) {
    map.set(r.key, r.matchCount);
  }
  return map;
});

// Get the {key, lineNumbers} entry for the currently viewed session (if it has search matches)
const currentSessionSearchMatch = computed(() => {
  if (!contentSearchResults.value || !viewingKey.value) return null;
  return contentSearchResults.value.find(r => r.key === viewingKey.value) || null;
});

/** Messages to display, applying system events and content filters */
const displayMessages = computed(() => {
  let msgs = messages.value;
  if (hideSystemEvents.value) {
    msgs = msgs.filter(m => !m.isInfo);
  }
  if (hideToolCalls.value || hideThinking.value) {
    // Hide assistant messages that became empty after removing tool calls / thinking
    msgs = msgs.filter(m => !m.isInfo && !(m.role === 'assistant' && !m.content.trim()));
  }
  return msgs;
});

/** Re-process messages for tool call and thinking filters */
function reprocessFilters() {
  const excludeToolCalls = hideToolCalls.value;
  const excludeThinking = hideThinking.value;
  const msgs = messages.value;
  let changed = false;
  for (const msg of msgs) {
    if (msg.rawBlocks && msg.role === 'assistant') {
      const newContent = extractBlocks(msg.rawBlocks, excludeToolCalls, excludeThinking);
      if (newContent !== msg.content) {
        msg.content = newContent;
        msg.html = renderMarkdown(newContent);
        changed = true;
      }
    }
  }
  if (changed) {
    // Force reactivity update for displayMessages
    messages.value = [...msgs];
  }
  if (searchQuery.value.trim()) {
    applyHighlightToMessages();
  }
}

/** Persist filter toggle to localStorage */
function persistFilter(key: string, value: boolean) {
  localStorage.setItem(key, String(value));
}

watch(hideToolCalls, (v) => { reprocessFilters(); persistFilter('oc-helper-hideToolCalls', v); });
watch(hideThinking, (v) => { reprocessFilters(); persistFilter('oc-helper-hideThinking', v); });
watch(hideSystemEvents, (v) => {
  persistFilter('oc-helper-hideSystemEvents', v);
});

// Count <mark> elements in the current view (approximate from message content)
const activeMatchCount = computed(() => {
  if (!searchQuery.value) return 0;
  const q = searchQuery.value.toLowerCase();
  let count = 0;
  const msgs = hideSystemEvents.value
    ? messages.value.filter(m => !m.isInfo)
    : messages.value;
  for (const msg of msgs) {
    const c = msg.content.toLowerCase();
    let idx = 0;
    while ((idx = c.indexOf(q, idx)) !== -1) {
      count++;
      idx += q.length;
    }
  }
  return count;
});

watch(searchQuery, (val) => {
  clearTimeout(searchTimer);
  if (!val.trim()) {
    contentSearchResults.value = null;
    // Re-render messages without highlights
    if (messages.value.length > 0) applyHighlightToMessages();
    return;
  }
  // Apply highlights immediately for currently loaded messages
  if (messages.value.length > 0) applyHighlightToMessages();
  searchTimer = setTimeout(async () => {
    try {
      const results = await gateway.searchSessionsContent(selectedAgent.value, val);
      contentSearchResults.value = results;
    } catch {
      // API unavailable (production mode) — fall through to key search
      contentSearchResults.value = [];
    }
  }, 300);
});

// Auto-select the first search result when content search completes,
// but only if no session is currently open or the open session isn't a match.
watch(contentSearchResults, (results) => {
  if (!results || results.length === 0) return;
  // Don't auto-switch if user already has a session that's in the results
  if (viewingKey.value && results.find(r => r.key === viewingKey.value)) return;
  const first = filteredSessions.value[0];
  if (first && viewingKey.value !== first.key) {
    console.warn('[Sessions] auto-select first result:', first.key);
    viewSession(first);
  }
});

// Re-apply highlights when messages change (e.g. new batch loaded)
watch(messages, () => {
  if (searchQuery.value.trim()) {
    applyHighlightToMessages();
  }
}, { deep: true });

const filteredSessions = computed(() => {
  // 合并活跃会话 + 归档会话
  let list = [
    ...gateway.sessions,
    ...gateway.archivedSessions,
  ];

  // 按时间倒序
  list.sort((a, b) => b.lastModified - a.lastModified);

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    if (contentSearchResults.value !== null) {
      const matched = new Set(contentSearchResults.value.map(r => r.key));
      list = list.filter(s => matched.has(s.key) || s.key.toLowerCase().includes(q));
    } else {
      list = list.filter(s => s.key.toLowerCase().includes(q));
    }
  }
  if (filterHasMessages.value) {
    list = list.filter(s => s.hasMessages);
  }
  return list;
});

// debugInfo removed
const LOAD_BATCH = 20;
let activeSessionKey = "";
let observer: IntersectionObserver | null = null;

// Auto-select first agent
watch(
  () => gateway.agents,
  (agents) => {
    if (agents.length > 0 && !selectedAgent.value) {
      selectedAgent.value = agents[0].id;
      loadSessions();
    }
  },
  { immediate: true }
);

async function loadSessions() {
  viewingSession.value = null;
  messages.value = [];
  totalLines.value = 0;
  await Promise.all([
    gateway.fetchSessions(selectedAgent.value),
    gateway.fetchArchivedSessions(selectedAgent.value),
  ]);
}

function buildSessionKey(s: SessionInfo): { agentId: string; key: string } {
  return {
    agentId: s.agentId || selectedAgent.value || gateway.agents[0]?.id || 'main',
    key: s.key,
  };
}

async function viewSession(s: SessionInfo) {
  viewingSession.value = s;
  resetState();
  activeSessionKey = s.key;

  const sk = buildSessionKey(s);

  const match = currentSessionSearchMatch.value;
  console.warn('[Sessions] viewSession: key=%s, hasMatch=%s', s.key, !!match);
  const initialStartLine = (match && match.lineNumbers.length > 0)
    ? Math.max(0, match.lineNumbers[0] - 10) // 10 lines of context before first match
    : undefined;
  const initialLimit = (match && match.lineNumbers.length > 0)
    ? 500 // max possible, enough to cover most sessions
    : LOAD_BATCH;

  // When search is active, use startLine to load forward from the first match
  await loadMessages(sk, initialStartLine, initialLimit, !!match, !!match);
  if (messages.value.length === 0 && !sessionError.value) {
    sessionError.value = '此会话没有用户/助手消息（可能只包含系统事件）';
  }
}

function resetState() {
  messages.value = [];
  totalLines.value = 0;
  loadedUpTo.value = 0;
  sessionError.value = '';
  // done loading
  loadingMore.value = false;
}

async function loadMessages(
  sk: { agentId: string; key: string },
  linePos?: number,
  limit = LOAD_BATCH,
  scrollToTop = false,
  useStartLine = false
) {
  if (loadingMore.value) return;

  const hasLinePos = linePos !== undefined;
  if (hasLinePos && !useStartLine) loadingMore.value = true; // backward load triggers loading state

  try {
    console.log('[Sessions] loadMessages: agentId=%s key=%s linePos=%s limit=%s useStartLine=%s', sk.agentId, sk.key, linePos, limit, useStartLine);
    const result = await gateway.readSessionLines(
      sk.agentId, sk.key, limit,
      useStartLine ? undefined : linePos,   // offsetLine for backward
      useStartLine ? linePos : undefined    // startLine for forward
    );
    if (activeSessionKey !== sk.key) return;

    totalLines.value = result.totalLines;
    loadedUpTo.value = result.startLine;

    const parsed = result.lines
      .map((line: string) => parseMessage(line))
      .filter((m: ChatMessage) => m.role === 'user' || m.role === 'assistant' || m.isInfo === true);

    const isBackwardLoad = hasLinePos && !useStartLine;
    if (isBackwardLoad) {
      // Prepend older messages, preserve scroll position
      const prevScroll = msgListRef.value?.scrollTop ?? 0;
      const prevHeight = msgListRef.value?.scrollHeight ?? 0;
      messages.value = [...parsed, ...messages.value];
      await nextTick();
      if (msgListRef.value) {
        const newHeight = msgListRef.value.scrollHeight;
        msgListRef.value.scrollTop = newHeight - prevHeight + prevScroll;
      }
    } else {
      messages.value = parsed;
      await nextTick();
      // Forward/search load: scroll to top for search results, bottom for normal view
      if (msgListRef.value) {
        msgListRef.value.scrollTop = scrollToTop ? 0 : msgListRef.value.scrollHeight;
      }
    }

    // Set up observer after DOM update
    await nextTick();
    setupObserver();
    // Apply tool call filter to newly loaded messages
    if (hideToolCalls.value || hideThinking.value) reprocessFilters();
  } catch (err: unknown) {
    const msg = (err as Error).message;
    // debug error
    if (!hasLinePos || (hasLinePos && useStartLine)) {
      sessionError.value = `加载失败: ${msg}`;
    }
  } finally {
    loadingMore.value = false;
  }
}

function renderMarkdown(content: string): string {
  if (!content) return '';
  try {
    return marked.parse(content, { breaks: true, gfm: true }) as string;
  } catch {
    // If markdown rendering fails, display as plain text
    return `<pre style="white-space:pre-wrap;margin:0">${escapeHtml(content)}</pre>`;
  }
}

/**
 * Post-process HTML to wrap search query matches in <mark> tags.
 * Only replaces text content between HTML tags, not inside tag attributes or CDATA.
 */
function highlightHtml(html: string, query: string): string {
  if (!query || !query.trim()) return html;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  // Replace only in text nodes between > and <
  return html.replace(/>([^<]+)</g, (match, text) => {
    return '>' + text.replace(re, '<mark class="search-highlight">$1</mark>') + '<';
  });
}

/** Apply search highlighting to all loaded messages */
function applyHighlightToMessages() {
  const q = searchQuery.value.trim();
  if (!q) {
    // Remove highlights by re-rendering
    for (const msg of messages.value) {
      if (msg.isInfo) continue;
      msg.html = renderMarkdown(msg.content);
    }
    return;
  }
  for (const msg of messages.value) {
    if (msg.isInfo) continue;
    const baseHtml = renderMarkdown(msg.content);
    msg.html = highlightHtml(baseHtml, q);
  }
  activeMatchIndex.value = 0;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTextContent(content: unknown, excludeToolCalls = false, excludeThinking = false): string {
  if (typeof content === 'string') {
    // Try parsing as JSON array of content blocks
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return extractBlocks(parsed, excludeToolCalls, excludeThinking);
      }
      if (parsed && typeof parsed === 'object' && parsed.text) {
        return String(parsed.text);
      }
    } catch {
      // Not JSON, use as-is
    }
    return content.trim();
  }
  if (Array.isArray(content)) {
    return extractBlocks(content, excludeToolCalls, excludeThinking);
  }
  if (content && typeof content === 'object') {
    const text = (content as any).text;
    if (typeof text === 'string') return text;
    return JSON.stringify(content, null, 2);
  }
  if (content === null || content === undefined) return '';
  return String(content);
}

function extractBlocks(blocks: any[], excludeToolCalls = false, excludeThinking = false): string {
  const parts: string[] = [];
  for (const item of blocks) {
    if (item.type === 'text' && item.text) {
      parts.push(item.text);
    } else if (item.type === 'thinking' && item.thinking) {
      if (!excludeThinking) {
        parts.push(`> 💭 ${item.thinking}`);
      }
    } else if (item.type === 'toolCall' && item.name) {
      if (!excludeToolCalls) {
        parts.push(`🔧 调用工具: **${item.name}**`);
      }
    }
  }
  return parts.join('\n\n');
}

/** Try to extract raw blocks array from content (for later re-processing) */
function extractRawBlocks(content: unknown): any[] | null {
  if (Array.isArray(content)) return content;
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not JSON */ }
  }
  return null;
}

function parseMessage(line: string): ChatMessage {
  const fallback: ChatMessage = {
    id: "",
    role: "unknown",
    content: line,
    html: `<pre>${escapeHtml(line)}</pre>`,
    time: "",
    model: "",
    summary: "",
    isInfo: false,
  };

  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return fallback;
  }

  const type = obj.type || "";

  // Timestamp formatting
  const fmtTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  };

  // Non-message types → info bubble
  if (type !== "message") {
    const summaries: Record<string, string> = {
      session: "🟢 会话开始",
      model_change: `🔄 切换模型: ${obj.modelId || obj.provider || "?"}`,
      thinking_level_change: `💭 思考级别: ${obj.thinkingLevel || "?"}`,
    };
    const summary = summaries[type] || (type === 'custom' ? `📌 ${obj.customType || '事件'}` : `📌 ${type}`);
    return {
      id: obj.id || "",
      role: type,
      content: "",
      html: "",
      time: fmtTime(obj.timestamp),
      model: "",
      summary,
      isInfo: true,
    };
  }

  // message type
  const msg = obj.message || {};
  const role = msg.role || "unknown";
  const rawBlocks = extractRawBlocks(msg.content);
  const content = extractTextContent(msg.content, false);

  let model = "";
  if (obj.model) {
    model = typeof obj.model === "string" ? obj.model : obj.model.primary || "";
  }
  if (msg.model) {
    model = typeof msg.model === "string" ? msg.model : msg.model.primary || model;
  }

  const html = renderMarkdown(content);

  return {
    id: obj.id || msg.id || "",
    role,
    content,
    html,
    time: fmtTime(obj.timestamp || msg.timestamp),
    model,
    summary: "",
    isInfo: false,
    rawBlocks,
  };
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    user: "用户",
    assistant: "助手",
    system: "系统",
    tool: "工具",
  };
  return labels[role] || role;
}

// IntersectionObserver-based infinite scroll
function setupObserver() {
  observer?.disconnect();
  observer = null;

  if (!topSentinel.value || !msgListRef.value) return;
  if (loadedUpTo.value <= 0) return; // nothing more to load

  observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) return;
      if (loadingMore.value) return;
      if (loadedUpTo.value <= 0) return;

      loadOlderMessages();
    },
    { root: msgListRef.value, threshold: 0.1 }
  );
  observer.observe(topSentinel.value);
}

// Manual scroll handler as fallback
function onScrollHandler() {
  if (observer || loadingMore.value || loadedUpTo.value <= 0) return;

  const el = msgListRef.value;
  if (!el) return;
  if (el.scrollTop < 50 && !loadingMore.value) {
    loadOlderMessages();
  }
}

async function loadOlderMessages() {
  const s = viewingSession.value;
  if (!s) return;
  const cur = loadedUpTo.value;
  if (cur <= 0) return;
  const sk = buildSessionKey(s);
  await loadMessages(sk, cur);
}

/** Scroll to the next/previous <mark> element in the message list */
function scrollToTop() {
  const container = msgListRef.value;
  if (container) container.scrollTop = 0;
}

function scrollToEnd() {
  const container = msgListRef.value;
  if (container) container.scrollTop = container.scrollHeight;
}

function scrollToMatch(direction: number) {
  const container = msgListRef.value;
  if (!container) return;

  const marks = container.querySelectorAll<HTMLElement>('mark.search-highlight');
  if (marks.length === 0) return;

  // Remove previous active highlight
  container.querySelector('mark.search-highlight.active')?.classList.remove('active');

  let next = activeMatchIndex.value + direction;
  if (next < 0) next = marks.length - 1;
  if (next >= marks.length) next = 0;
  activeMatchIndex.value = next;

  const el = marks[next];
  el.classList.add('active');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Reset match index when viewing a new session
watch(viewingKey, () => { activeMatchIndex.value = 0; });

// ── Export ────────────────────────────────────────────────────────────────
const showExportMenu = ref(false);
const exportRef = ref<HTMLElement | null>(null);

function toggleExportMenu() {
  showExportMenu.value = !showExportMenu.value;
}

function closeExportMenu(e: MouseEvent) {
  if (exportRef.value && !exportRef.value.contains(e.target as Node)) {
    showExportMenu.value = false;
  }
}

function makeFilename(format: string): string {
  const key = viewingKey.value.slice(0, 16);
  const now = new Date().toISOString().slice(0, 10);
  return `oc-session-${key}-${now}.${format === 'markdown' ? 'md' : format === 'json' ? 'json' : 'txt'}`;
}

function exportSession(format: 'markdown' | 'json' | 'text') {
  showExportMenu.value = false;
  const msgs = displayMessages.value;
  if (!msgs.length) return;

  let content = '';
  const filename = makeFilename(format);

  if (format === 'json') {
    content = JSON.stringify(msgs.map(m => ({
      role: m.role,
      content: m.content,
      time: m.time,
    })), null, 2);
  } else if (format === 'markdown') {
    content = `# 会话导出 — ${viewingKey.value.slice(0, 16)}\n\n`;
    for (const m of msgs) {
      const roleLabel = m.role === 'user' ? '👤 用户' : m.role === 'assistant' ? '🤖 助手' : m.role === 'info' ? 'ℹ️ 系统' : `🔧 ${m.role}`;
      const timeStr = m.time;
      content += `### ${roleLabel}${timeStr ? ' — ' + timeStr : ''}\n\n${m.content || ''}\n\n---\n\n`;
    }
  } else {
    // Plain text
    for (const m of msgs) {
      const roleLabel = m.role === 'user' ? '[用户]' : m.role === 'assistant' ? '[助手]' : `[${m.role}]`;
      const timeStr = m.time;
      content += `${roleLabel}${timeStr ? ' ' + timeStr : ''}\n${m.content || ''}\n\n`;
    }
  }

  downloadFile(content, filename, format === 'json' ? 'application/json' : format === 'markdown' ? 'text/markdown' : 'text/plain');
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Delete ────────────────────────────────────────────────────────────────
function confirmDelete() {
  showDeleteConfirm.value = true;
}

async function doDelete() {
  const s = viewingSession.value;
  if (!s) return;
  const sk = buildSessionKey(s);
  const stateDir = gateway.status?.stateDir || '';
  const sessionDir = `${stateDir}/agents/${selectedAgent.value}/sessions`;
  await gateway.deleteSession(`${sessionDir}/${s.key}.jsonl`);
  showDeleteConfirm.value = false;
  viewingSession.value = null;
  messages.value = [];
  totalLines.value = 0;
  loadSessions();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return d.toLocaleDateString("zh-CN");
}

// Cleanup observer on unmount
onUnmounted(() => {
  document.removeEventListener('click', closeExportMenu);
  observer?.disconnect();
});

onMounted(() => {
  // watch handles auto-load
  document.addEventListener('click', closeExportMenu);
  loadSessions();
});
</script>

<style scoped>
.sessions-layout {
  display: flex;
  gap: 1rem;
  min-height: 500px;
  height: calc(100vh - 120px);
}

/* 左侧列表 */
.sessions-list {
  width: 220px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  overflow-y: auto;
  padding: 4px;
}
.session-item {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s;
  border-left: 3px solid transparent;
}
.session-item:hover { background: var(--mantle); }
.session-item.active {
  background: var(--surface0);
  border-left-color: var(--accent);
}
.session-item-key {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-primary);
}
.session-item-meta { margin-top: 3px; padding-left: 17px; }

/* 右侧对话区 */
.session-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  overflow: hidden;
}
.chat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--mantle);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  font-size: 13px;
}
.chat-file {
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--subtext1);
}

/* 消息列表 */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: var(--base);
  display: flex;
  flex-direction: column;
  user-select: text;
}
.chat-messages * {
  user-select: text;
}
.sentinel { height: 1px; flex-shrink: 0; }
.load-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  padding: 8px 0;
  color: var(--text-muted);
  font-size: 12px;
}
.load-more-hint {
  text-align: center;
  padding: 8px 0;
}

/* 聊天气泡行 */
.chat-bubble-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 16px;
  max-width: 80%;
}
/* .debug-bar removed */
.session-error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  color: var(--danger);
  font-size: 12px;
  flex-shrink: 0;
}
.chat-bubble-row.role-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.chat-bubble-row.role-assistant {
  align-self: flex-start;
}
.chat-bubble-row.info-row {
  align-self: center;
  max-width: 90%;
}

/* 头像 */
.chat-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.user-avatar {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}
.assistant-avatar {
  background: color-mix(in srgb, var(--mauve) 20%, transparent);
  color: var(--mauve);
}
.info-avatar {
  width: 20px;
  height: 20px;
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
  color: var(--text-muted);
  margin-top: 2px;
}

/* 气泡 */
.chat-bubble {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chat-bubble-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}
.chat-bubble-label {
  font-size: 11px;
  font-weight: 700;
}
.role-user .chat-bubble-label { color: var(--accent); }
.role-assistant .chat-bubble-label { color: var(--mauve); }
.chat-bubble-body {
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
}
.role-user .chat-bubble-body {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
}
.role-assistant .chat-bubble-body {
  background: var(--surface0);
  border: 1px solid var(--border);
}
.info-bubble {
  background: transparent;
  border: none;
}
.info-bubble .chat-bubble-label {
  font-weight: 400;
  font-size: 11px;
}

/* 紧凑表单控件 */
.input-sm, .select-sm {
  font-size: 12px;
  padding: 4px 8px;
  height: 28px;
}
.filter-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.filter-label:hover {
  color: var(--text-primary);
}
.filter-label input[type="checkbox"] {
  accent-color: var(--accent);
}

/* 搜索高亮 */
:deep(.search-highlight) {
  background: color-mix(in srgb, var(--yellow) 40%, transparent);
  border-radius: 2px;
  padding: 0 1px;
}
:deep(.search-highlight.active) {
  background: var(--yellow);
  color: var(--base);
  outline: 2px solid var(--yellow);
}

/* 匹配导航条 */
.search-match-info {
  color: var(--yellow);
  font-weight: 600;
  white-space: nowrap;
}
.btn-xs {
  font-size: 11px;
  padding: 2px 5px;
  height: 22px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface0);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s;
}
.btn-xs:hover {
  background: var(--surface1);
  color: var(--text-primary);
}

/* 会话标题描述 */
.session-item-desc {
  color: var(--text-muted);
  padding-left: 17px;
  line-height: 1.3;
  margin-top: 1px;
}

/* 会话列表匹配计数 */
.session-match-count {
  margin-top: 2px;
  padding-left: 17px;
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--yellow);
}

/* 空状态 */
.session-empty-select {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  opacity: 0.5;
}

/* 导出下拉菜单 */
.export-dropdown {
  position: relative;
}
.export-menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 4px;
  min-width: 160px;
  background: var(--surface0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  z-index: 100;
  overflow: hidden;
}
.export-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  font-size: 12px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.export-item:hover {
  background: var(--surface1);
}

/* 归档会话标记 */
.archived-badge {
  display: inline-block;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--surface1);
  color: var(--text-muted);
  margin-left: 4px;
  line-height: 1.4;
}
.archived-item {
  opacity: 0.6;
}
.archived-item:hover {
  opacity: 1;
}
</style>
