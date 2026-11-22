<script setup lang="ts">
defineProps<{ size?: number }>()
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M4 8c3-3 5 3 8 0s5 3 8 0" />
    <path d="M4 16c3-3 5 3 8 0s5 3 8 0" />
  </svg>
</template>
