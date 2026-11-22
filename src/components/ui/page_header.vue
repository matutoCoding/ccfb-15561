<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <header class="page-header">
    <div>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    </div>
    <div class="page-actions"><slot name="actions" /></div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
}
.page-title {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
}
.page-subtitle {
  margin-top: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.page-actions {
  display: flex;
  gap: var(--sp-3);
}
</style>
