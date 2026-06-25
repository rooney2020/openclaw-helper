<template>
  <div class="terminal-page">
    <div class="terminal-toolbar">
      <span class="text-xs" :style="{ color: connected ? 'var(--green)' : 'var(--red)' }">
        {{ connected ? "已连接" : "未连接" }}
        <template v-if="connected && tuiRunning"> · TUI 运行中</template>
        <template v-if="connected && !tuiRunning"> · <span style="color:var(--yellow)">等待 TUI 启动...</span></template>
      </span>
      <div style="flex:1"></div>
      <button class="btn btn-xs" @click="restartTui" :disabled="restarting">
        {{ restarting ? "重启中..." : "重启 TUI" }}
      </button>
      <button class="btn btn-xs" @click="reconnect" style="margin-left:4px">重连</button>
    </div>
    <div ref="terminalContainer" class="terminal-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const terminalContainer = ref<HTMLDivElement>();
const connected = ref(false);
const tuiRunning = ref(false);
const restarting = ref(false);

let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;

function getWsUrl(): string {
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${loc.host}/api/tui/ws`;
}

function sendControl(msg: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendResize() {
  if (term && fitAddon) {
    try { fitAddon.fit(); } catch {}
    const cols = term.cols;
    const rows = term.rows;
    if (cols > 0 && rows > 0) {
      sendControl({ type: "resize", cols, rows });
    }
  }
}

async function restartTui() {
  restarting.value = true;
  // Clear terminal
  if (term) {
    term.reset();
    term.write("\r\n\x1b[36m正在重启 TUI...\x1b[0m\r\n");
  }
  sendControl({ type: "restart" });
  await new Promise((r) => setTimeout(r, 1000));
  restarting.value = false;
  tuiRunning.value = true;
  // Re-send resize after restart
  setTimeout(sendResize, 500);
}

async function awaitBlob(blob: Blob): Promise<string> {
  return new Response(blob).text();
}

function connect() {
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    ws = null;
  }

  ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    connected.value = true;
    tuiRunning.value = true;
    setTimeout(sendResize, 300);
  };

  ws.onmessage = (evt) => {
    if (term) {
      // Set tuiRunning to false if we get exit messages
      if (typeof evt.data === "string" && evt.data.includes("TUI 进程已退出")) {
        tuiRunning.value = false;
      }
      term.write(typeof evt.data === "string" ? evt.data : awaitBlob(evt.data));
    }
  };

  ws.onclose = () => {
    connected.value = false;
    tuiRunning.value = false;
    if (term) {
      term.write("\r\n\x1b[33m[连接断开]\x1b[0m\r\n");
    }
    reconnectTimer = setTimeout(() => connect(), 3000);
  };

  ws.onerror = () => {
    // onclose will fire next
  };
}

function reconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (term) {
    term.write("\r\n\x1b[36m正在重连...\x1b[0m\r\n");
  }
  connect();
}

onMounted(async () => {
  await nextTick();

  if (!terminalContainer.value) return;

  term = new Terminal({
    cursorBlink: true,
    cursorStyle: "block",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    theme: {
      background: "#0d1117",
      foreground: "#e6edf3",
      cursor: "#e6edf3",
      selectionBackground: "#58a6ff40",
      black: "#484f58",
      red: "#ff7b72",
      green: "#3fb950",
      yellow: "#d29922",
      blue: "#58a6ff",
      magenta: "#bc8cff",
      cyan: "#39c5cf",
      white: "#b1bac4",
      brightBlack: "#6e7681",
      brightRed: "#ffa198",
      brightGreen: "#56d364",
      brightYellow: "#e3b341",
      brightBlue: "#79c0ff",
      brightMagenta: "#d2a8ff",
      brightCyan: "#56d4dd",
      brightWhite: "#f0f6fc",
    },
    allowTransparency: true,
    allowProposedApi: true,
    convertEol: true,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(terminalContainer.value);

  // Fit after delay for correct initial dimensions, then send resize
  setTimeout(() => sendResize(), 100);

  // Resize observer → refit + notify server
  resizeObserver = new ResizeObserver(() => sendResize());
  resizeObserver.observe(terminalContainer.value);

  // Send keyboard input to WebSocket
  term.onData((data: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  // Connect to backend
  connect();
});

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  if (term) term.dispose();
});
</script>

<style scoped>
.terminal-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.terminal-toolbar {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--surface0);
  border-bottom: 1px solid var(--surface1);
  gap: 4px;
}
.terminal-container {
  flex: 1;
  min-height: 0;
  background: #0d1117;
}
</style>
