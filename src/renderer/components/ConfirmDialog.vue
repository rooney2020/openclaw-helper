<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="onCancel">
      <div class="dialog-box">
        <h3>{{ title }}</h3>
        <p>{{ message }}</p>
        <div class="dialog-actions">
          <button class="btn" @click="onCancel">{{ cancelText }}</button>
          <button
            class="btn"
            :class="confirmClass"
            @click="onConfirm"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}>(), {
  confirmText: "确认",
  cancelText: "取消",
  danger: false,
});

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const confirmClass = computed(() => props.danger ? "btn-danger" : "btn-primary");

function onConfirm() { emit("confirm"); }
function onCancel() { emit("cancel"); }
</script>
