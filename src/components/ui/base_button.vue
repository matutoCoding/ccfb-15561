<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    disabled?: boolean
  }>(),
  { variant: 'secondary', size: 'md', disabled: false },
)
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    class="btn"
    :class="[`btn-${variant}`, `btn-${size}`, { disabled }]"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-weight: var(--fw-medium);
  transition: all var(--t-fast);
  white-space: nowrap;
}
.btn-md {
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-xs);
}
.btn-sm {
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
}
.btn-primary {
  background: var(--c-primary);
  color: #fff;
}
.btn-primary:hover:not(.disabled) {
  background: var(--c-primary-hover);
}
.btn-secondary {
  background: var(--c-surface);
  border-color: var(--c-border);
  color: var(--c-text);
}
.btn-secondary:hover:not(.disabled) {
  background: var(--c-surface-2);
}
.btn-ghost {
  background: transparent;
  color: var(--c-text-2);
}
.btn-ghost:hover:not(.disabled) {
  background: var(--c-surface-2);
  color: var(--c-text);
}
.btn-danger {
  background: var(--c-danger-soft);
  color: var(--c-danger);
}
.btn-danger:hover:not(.disabled) {
  background: var(--c-danger);
  color: #fff;
}
.btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
