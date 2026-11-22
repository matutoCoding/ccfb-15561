<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string | number
  type?: string
  step?: string | number
  suffix?: string
  min?: number
  max?: number
}>()
defineEmits<{ 'update:modelValue': [value: number | string] }>()
</script>

<template>
  <label class="field">
    <span class="field-label">{{ label }}</span>
    <span class="field-control">
      <input
        class="field-input"
        :type="type ?? 'text'"
        :value="modelValue"
        :step="step"
        :min="min"
        :max="max"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <span v-if="suffix" class="field-suffix">{{ suffix }}</span>
    </span>
  </label>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.field-label {
  font-size: var(--fs-xs);
  color: var(--c-text-2);
  font-weight: var(--fw-medium);
}
.field-control {
  position: relative;
  display: flex;
  align-items: center;
}
.field-input {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  font-size: var(--fs-xs);
  transition: border-color var(--t-fast), box-shadow var(--t-fast);
}
.field-input:focus {
  outline: none;
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px var(--c-primary-soft);
}
.field-suffix {
  position: absolute;
  right: var(--sp-3);
  color: var(--c-text-3);
  pointer-events: none;
}
</style>
