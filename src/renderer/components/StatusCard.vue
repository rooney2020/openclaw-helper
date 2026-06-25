<template>
  <div class="card">
    <div class="card-title" :style="{ color: accentColor }">
      <slot name="title">{{ title }}</slot>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  title?: string;
  accent?: "peach" | "mauve" | "sky" | "teal" | "green" | "blue" | "yellow";
}>(), {
  accent: "teal",
});

const colorMap: Record<string, string> = {
  peach: "var(--peach)", mauve: "var(--mauve)", sky: "var(--sky)",
  teal: "var(--teal)", green: "var(--green)", blue: "var(--blue)", yellow: "var(--yellow)",
};
const accentColor = computed(() => colorMap[props.accent] || "var(--teal)");
</script>
