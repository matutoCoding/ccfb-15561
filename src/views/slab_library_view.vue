<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/ui/page_header.vue'
import BaseButton from '@/components/ui/base_button.vue'
import EmptyState from '@/components/ui/empty_state.vue'
import SlabCard from '@/components/slab/slab_card.vue'
import SlabFormDialog from '@/components/slab/slab_form_dialog.vue'
import { useSlabStore } from '@/stores/slab_store'
import type { Slab } from '@/core/types'

const slabStore = useSlabStore()
const showForm = ref(false)
const editing = ref<Slab | undefined>()
const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return slabStore.slabs
  return slabStore.slabs.filter(
    (s) =>
      s.code.toLowerCase().includes(kw) ||
      s.batchNo.toLowerCase().includes(kw) ||
      s.note.toLowerCase().includes(kw),
  )
})

const openCreate = () => {
  editing.value = undefined
  showForm.value = true
}

const openEdit = (slab: Slab) => {
  editing.value = slab
  showForm.value = true
}

const remove = async (slab: Slab) => {
  if (!window.confirm(`确认删除大板 ${slab.code}？关联照片将一并清除`)) return
  await slabStore.remove(slab.id)
}
</script>

<template>
  <div class="page">
    <PageHeader title="大板库" subtitle="照片入库自动校正，或程序生成大理石/石英岩纹理">
      <template #actions>
        <BaseButton variant="primary" @click="openCreate">新增大板</BaseButton>
      </template>
    </PageHeader>

    <div class="toolbar">
      <input v-model="keyword" class="search" placeholder="搜索编号 / 批次 / 备注" />
      <p class="count">共 {{ filtered.length }} 张</p>
    </div>

    <EmptyState
      v-if="filtered.length === 0"
      title="还没有大板"
      subtitle="先录入一块大板，支持上传现场照片或程序生成纹理"
    >
      <BaseButton variant="primary" @click="openCreate">新增大板</BaseButton>
    </EmptyState>

    <div v-else class="grid">
      <SlabCard
        v-for="slab in filtered"
        :key="slab.id"
        :slab="slab"
        @edit="openEdit(slab)"
        @remove="remove(slab)"
      />
    </div>

    <SlabFormDialog
      v-if="showForm"
      :slab="editing"
      @close="showForm = false"
    />
  </div>
</template>

<style scoped>
.page {
  padding: var(--sp-6);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
}
.search {
  width: 320px;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  font-size: var(--fs-xs);
}
.search:focus {
  outline: none;
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px var(--c-primary-soft);
}
.count {
  color: var(--c-text-3);
  font-size: var(--fs-xs);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--sp-4);
}
</style>
