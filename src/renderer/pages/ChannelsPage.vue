<template>
  <div>
    <div v-if="gateway.channelsLoading" class="card">
      <div style="display:flex;align-items:center;gap:8px;padding:2rem 0;justify-content:center">
        <div class="spinner" /> 加载渠道列表…
      </div>
    </div>

    <template v-else>
      <!-- 已配置 -->
      <div v-if="configuredBuiltin.length" style="margin-bottom:1rem">
        <div class="card-title" style="margin-bottom:0.5rem">已配置渠道</div>
        <div class="grid-2">
          <div v-for="ch in configuredBuiltin" :key="ch.name" class="card">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <Icon name="check-circle" :size="18" style="color:var(--green)" />
              <strong>{{ ch.displayName }}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span class="dot online" />
              <span class="text-xs">已配置</span>
              <span class="badge badge-success" style="font-size:10px">已启用</span>
            </div>
            <span class="text-xs text-muted">类型: {{ ch.type }}</span>
            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm" @click="editConfig(ch)">
                <Icon name="channels" :size="11" /> 编辑配置
              </button>
              <button class="btn btn-sm" @click="toggleEnabled(ch)" :title="ch.enabled ? '禁用' : '启用'">
                <Icon :name="ch.enabled ? 'stop' : 'play'" :size="11" />
                {{ ch.enabled ? '禁用' : '启用' }}
              </button>
              <button class="btn btn-sm btn-danger" @click="confirmDelete(ch)">
                <Icon name="trash" :size="11" /> 删除
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 未配置 -->
      <div v-if="unconfiguredBuiltin.length">
        <div class="card-title" style="margin-bottom:0.5rem">未配置渠道</div>
        <div class="grid-4">
          <div v-for="ch in unconfiguredBuiltin" :key="ch.name" class="card" style="opacity:0.6">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <Icon name="channels" :size="18" />
              <strong>{{ ch.displayName }}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span class="dot offline" />
              <span class="text-xs">未配置</span>
              <span class="badge badge-danger" style="font-size:10px">未配置</span>
            </div>
            <span class="text-xs text-muted">类型: {{ ch.type }}</span>
          </div>
        </div>
      </div>

      <!-- 插件/外部渠道 -->
      <div v-if="userChannels.length" style="margin-top:1rem">
        <div class="card-title" style="margin-bottom:0.5rem">插件 / 外部渠道</div>
        <div class="grid-2">
          <div v-for="ch in userChannels" :key="ch.name" class="card">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <Icon :name="ch.configured ? 'check-circle' : 'channels'" :size="18"
                :style="ch.configured ? {color:'var(--green)'} : {}" />
              <strong>{{ ch.displayName }}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span class="dot" :class="ch.configured ? 'online' : 'offline'" />
              <span class="text-xs">{{ ch.configured ? '已配置' : '未配置' }}</span>
              <span class="badge" :class="ch.configured ? 'badge-success' : 'badge-danger'" style="font-size:10px">
                {{ ch.configured ? '已配置' : '未配置' }}
              </span>
            </div>
            <span class="text-xs text-muted">类型: {{ ch.type }}</span>
            <div v-if="ch.configured" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm" @click="editConfig(ch)">
                <Icon name="channels" :size="11" /> 编辑配置
              </button>
              <button class="btn btn-sm" @click="toggleEnabled(ch)">
                <Icon :name="ch.enabled ? 'stop' : 'play'" :size="11" />
                {{ ch.enabled ? '禁用' : '启用' }}
              </button>
              <button class="btn btn-sm btn-danger" @click="confirmDelete(ch)">
                <Icon name="trash" :size="11" /> 删除
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!gateway.channels.length" class="card" style="text-align:center;padding:2rem">
        <p class="text-muted text-sm">无可用渠道</p>
      </div>
    </template>

    <div v-if="msg" class="action-toast" :class="'toast-' + msgType">
      <Icon :name="msgType === 'success' ? 'check-circle' : 'alert-circle'" :size="14" />
      {{ msg }}
    </div>

    <!-- 编辑配置弹窗 -->
    <Teleport to="body">
      <div v-if="editDialog" class="modal-overlay" @click.self="editDialog = null">
        <div class="modal">
          <div class="modal-header">
            <strong>{{ editDialog.displayName }} 配置</strong>
            <button class="btn btn-sm" @click="editDialog = null">
              <Icon name="x" :size="12" />
            </button>
          </div>
          <div class="modal-body">
            <textarea
              class="config-editor"
              v-model="editConfigText"
              rows="12"
              spellcheck="false"
            ></textarea>
            <div v-if="editConfigError" class="config-error text-xs">{{ editConfigError }}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-sm" @click="editDialog = null">取消</button>
            <button class="btn btn-sm btn-primary" @click="saveConfig" :disabled="editSaving">
              {{ editSaving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="deleteDialog" class="modal-overlay" @click.self="deleteDialog = null">
        <div class="modal" style="min-width:360px">
          <div class="modal-header">
            <strong>确认删除</strong>
            <button class="btn btn-sm" @click="deleteDialog = null">
              <Icon name="x" :size="12" />
            </button>
          </div>
          <div class="modal-body">
            <p>确定删除 <strong>{{ deleteDialog.displayName }}</strong> 的配置？</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-sm" @click="deleteDialog = null">取消</button>
            <button class="btn btn-sm btn-danger" @click="doDelete" :disabled="deleting">
              {{ deleting ? '删除中…' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Icon from "../components/Icon.vue";
import { useGatewayStore, type ChannelInfo } from "../stores/gateway";

const gateway = useGatewayStore();

const configuredBuiltin = computed(() => gateway.channels.filter(c => c.type === 'builtin' && c.configured));
const unconfiguredBuiltin = computed(() => gateway.channels.filter(c => c.type === 'builtin' && !c.configured));
const userChannels = computed(() => gateway.channels.filter(c => c.type !== 'builtin'));

// ── 编辑配置 ──
const editDialog = ref<ChannelInfo | null>(null);
const editConfigText = ref("");
const editConfigError = ref("");
const editSaving = ref(false);

function editConfig(ch: ChannelInfo) {
  editDialog.value = ch;
  editConfigText.value = JSON.stringify(ch.config, null, 2);
  editConfigError.value = "";
}

async function saveConfig() {
  if (!editDialog.value) return;
  editConfigError.value = "";
  try {
    const config = JSON.parse(editConfigText.value);
    editSaving.value = true;
    await gateway.updateChannelConfig(editDialog.value.name, config);
    showToast(`${editDialog.value.displayName} 配置已更新`, "success");
    editDialog.value = null;
  } catch (err: unknown) {
    editConfigError.value = `JSON 格式错误: ${(err as Error).message}`;
  } finally {
    editSaving.value = false;
  }
}

// ── 启用/禁用 ──
async function toggleEnabled(ch: ChannelInfo) {
  await gateway.updateChannelConfig(ch.name, { enabled: !ch.enabled });
  showToast(`${ch.displayName} 已${ch.enabled ? '禁用' : '启用'}`, "success");
}

// ── 删除 ──
const deleteDialog = ref<ChannelInfo | null>(null);
const deleting = ref(false);

function confirmDelete(ch: ChannelInfo) {
  deleteDialog.value = ch;
}

async function doDelete() {
  if (!deleteDialog.value) return;
  deleting.value = true;
  try {
    await gateway.deleteChannel(deleteDialog.value.name);
    showToast(`${deleteDialog.value.displayName} 配置已删除`, "success");
    deleteDialog.value = null;
  } catch (err: unknown) {
    showToast(`删除失败: ${(err as Error).message}`, "error");
  } finally {
    deleting.value = false;
  }
}

// ── Toast ──
const msg = ref("");
const msgType = ref("success");

function showToast(text: string, type = "success") {
  msg.value = text;
  msgType.value = type;
  setTimeout(() => { msg.value = ""; }, 3000);
}

onMounted(() => {
  if (gateway.channels.length === 0) gateway.fetchChannels();
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 480px;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}
.modal-body {
  padding: 16px;
  overflow-y: auto;
}
.modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
.config-editor {
  width: 100%;
  min-height: 200px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  background: var(--base);
  color: var(--text-primary);
  border: 1px solid var(--surface0);
  border-radius: var(--radius-sm);
  padding: 8px;
  resize: vertical;
  tab-size: 2;
}
.config-editor:focus {
  outline: none;
  border-color: var(--blue);
}
.config-error {
  color: var(--red);
  margin-top: 4px;
}

.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

/* Toast */
.action-toast {
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  z-index: 1000;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.toast-success { border-color: var(--green); color: var(--green); }
.toast-error { border-color: var(--red); color: var(--red); }
</style>
