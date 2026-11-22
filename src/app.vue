<script setup lang="ts">
import { onMounted } from 'vue'
import AppSidebar from '@/components/app_sidebar.vue'
import { useSettingsStore } from '@/stores/settings_store'
import { useSlabStore } from '@/stores/slab_store'
import { useProjectStore } from '@/stores/project_store'
import { usePlanStore } from '@/stores/plan_store'

const settings = useSettingsStore()
const slabStore = useSlabStore()
const projectStore = useProjectStore()
const planStore = usePlanStore()

onMounted(async () => {
  await settings.load()
  await Promise.all([slabStore.load(), projectStore.load(), planStore.load()])
})
</script>

<template>
  <div class="app-shell">
    <AppSidebar />
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100%;
}
.app-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: auto;
}
</style>
