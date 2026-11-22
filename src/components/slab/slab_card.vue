<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { Slab } from '@/core/types'
import { getPhotoBlob } from '@/core/db'
import BaseButton from '@/components/ui/base_button.vue'
import { formatArea } from '@/core/util'

const props = defineProps<{ slab: Slab }>()
defineEmits<{ edit: []; remove: [] }>()

const thumbUrl = ref<string>()

const loadThumb = async () => {
  if (!props.slab.photo) return
  const blob = await getPhotoBlob(props.slab.photo.blobKey)
  if (blob) thumbUrl.value = URL.createObjectURL(blob)
}

onMounted(loadThumb)
watch(() => props.slab.id, loadThumb)

const categoryText: Record<Slab['category'], string> = {
  marble: '大理石',
  quartzite: '石英岩',
  granite: '花岗岩',
  sintered: '岩板',
}
</script>

<template>
  <article class="card">
    <div class="thumb">
      <img v-if="thumbUrl" :src="thumbUrl" :alt="slab.code" />
      <div v-else class="thumb-proc">
        <span>{{ slab.procedural?.kind === 'quartzite' ? '石英岩' : '大理石' }}</span>
        <p>程序生成纹理</p>
      </div>
      <span class="badge">{{ categoryText[slab.category] }}</span>
    </div>
    <div class="body">
      <div class="row">
        <p class="code">{{ slab.code }}</p>
        <p class="batch">{{ slab.batchNo }} · #{{ slab.seqInBatch }}</p>
      </div>
      <p class="meta">
        {{ slab.widthMm }} × {{ slab.heightMm }} × {{ slab.thicknessMm }} mm
      </p>
      <p class="meta">{{ formatArea(slab.widthMm * slab.heightMm) }} · 留量 {{ slab.edgeMarginMm }}mm</p>
      <p v-if="slab.defects.length" class="defect">缺陷区 {{ slab.defects.length }} 处</p>
      <div class="actions">
        <BaseButton size="sm" @click="$emit('edit')">编辑</BaseButton>
        <BaseButton size="sm" variant="danger" @click="$emit('remove')">删除</BaseButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--t), transform var(--t);
}
.card:hover {
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}
.thumb {
  position: relative;
  aspect-ratio: 2 / 1;
  background: var(--c-surface-2);
  overflow: hidden;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-proc {
  width: 100%;
  height: 100%;
  display: grid;
  place-content: center;
  text-align: center;
  gap: var(--sp-1);
  color: var(--c-text-3);
  background: linear-gradient(135deg, var(--c-surface-2), var(--c-border));
}
.thumb-proc span {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--c-text-2);
}
.badge {
  position: absolute;
  top: var(--sp-2);
  left: var(--sp-2);
  padding: 2px var(--sp-2);
  border-radius: var(--radius-sm);
  background: rgba(17, 20, 24, 0.72);
  color: #fff;
  font-size: var(--fs-xs);
}
.body {
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.code {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}
.batch {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.meta {
  font-size: var(--fs-xs);
  color: var(--c-text-2);
}
.defect {
  font-size: var(--fs-xs);
  color: var(--c-danger);
  font-weight: var(--fw-medium);
}
.actions {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}
</style>
