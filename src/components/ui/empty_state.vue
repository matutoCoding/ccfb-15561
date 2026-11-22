<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="empty">
    <div class="empty-icon">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
      </svg>
    </div>
    <p class="empty-title">{{ title }}</p>
    <p v-if="subtitle" class="empty-subtitle">{{ subtitle }}</p>
    <div class="empty-action"><slot /></div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-7) var(--sp-5);
  background: var(--c-surface);
  border: 1px dashed var(--c-border);
  border-radius: var(--radius-lg);
}
.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: var(--c-surface-2);
  color: var(--c-text-3);
  display: grid;
  place-items: center;
}
.empty-title {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}
.empty-subtitle {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.empty-action {
  margin-top: var(--sp-2);
}
</style>
