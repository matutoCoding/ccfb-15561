<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/page_header.vue'
import BaseButton from '@/components/ui/base_button.vue'
import BaseField from '@/components/ui/base_field.vue'
import { useProjectStore } from '@/stores/project_store'
import { uid } from '@/core/util'
import type { HoleSpec, ProjectFace, SurfaceFinish } from '@/core/types'

const props = defineProps<{ id: string }>()
const router = useRouter()
const projectStore = useProjectStore()

onMounted(async () => {
  if (!projectStore.current || projectStore.current.id !== props.id) {
    await projectStore.open(props.id)
  }
})

const project = computed(() => projectStore.current)
const selectedFaceId = ref('')
const selectedFace = computed<ProjectFace | undefined>(() => {
  if (!project.value) return undefined
  return (
    project.value.faces.find((f) => f.id === selectedFaceId.value) ??
    project.value.faces[0]
  )
})

const kindText: Record<ProjectFace['kind'], string> = {
  countertop: '台面',
  island: '岛台',
  'feature-wall': '背景墙',
  other: '构件',
}

const finishText: Record<SurfaceFinish, string> = {
  polished: '亮光面',
  honed: '哑光面',
  leathered: '荔枝面',
}

const addHole = () => {
  if (!selectedFace.value) return
  const face = selectedFace.value
  const hole: HoleSpec = {
    id: uid('hole'),
    name: `开孔 ${face.holes.length + 1}`,
    rect: {
      x: face.widthMm / 2 - 200,
      y: face.heightMm / 2 - 200,
      w: 400,
      h: 400,
    },
    kind: 'sink',
    cornerRadiusMm: 10,
  }
  face.holes.push(hole)
  projectStore.persist()
}

const removeHole = (holeId: string) => {
  if (!selectedFace.value) return
  selectedFace.value.holes = selectedFace.value.holes.filter((h) => h.id !== holeId)
  projectStore.persist()
}

const goLayout = () => router.push(`/layout/${props.id}`)
</script>

<template>
  <div v-if="project" class="page">
    <PageHeader :title="project.name" subtitle="绘制加工面、开孔、倒角与下垂边">
      <template #actions>
        <BaseButton @click="router.push('/projects')">返回列表</BaseButton>
        <BaseButton variant="primary" @click="goLayout">进入排版</BaseButton>
      </template>
    </PageHeader>

    <div class="layout">
      <aside class="face-panel card">
        <div class="panel-head">
          <p class="panel-title">加工面</p>
        </div>
        <div class="face-list">
          <button
            v-for="face in project.faces"
            :key="face.id"
            class="face-item"
            :class="{ active: selectedFace?.id === face.id }"
            @click="selectedFaceId = face.id"
          >
            <span>{{ face.name }}</span>
            <p>{{ kindText[face.kind] }}</p>
          </button>
        </div>
        <div class="add-row">
          <BaseButton size="sm" @click="projectStore.addFace('countertop')">加台面</BaseButton>
          <BaseButton size="sm" @click="projectStore.addFace('island')">加岛台</BaseButton>
          <BaseButton size="sm" @click="projectStore.addFace('feature-wall')">加背景墙</BaseButton>
        </div>
      </aside>

      <section v-if="selectedFace" class="editor card">
        <div class="editor-head">
          <input v-model="selectedFace.name" class="name-input" @change="projectStore.persist()" />
          <BaseButton
            size="sm"
            variant="danger"
            :disabled="project.faces.length <= 1"
            @click="projectStore.removeFace(selectedFace.id)"
          >
            删除该面
          </BaseButton>
        </div>

        <div class="grid-3">
          <BaseField label="宽度" v-model="selectedFace.widthMm" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
          <BaseField label="高度" v-model="selectedFace.heightMm" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
          <BaseField label="厚度" v-model="selectedFace.thicknessMm" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
          <BaseField label="下垂边高度" v-model="selectedFace.dropEdgeMm" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
          <label class="field">
            <span class="field-label">表面处理</span>
            <select v-model="selectedFace.finish" class="input" @change="projectStore.persist()">
              <option v-for="(text, key) in finishText" :key="key" :value="key">{{ text }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">面类型</span>
            <select v-model="selectedFace.kind" class="input" @change="projectStore.persist()">
              <option v-for="(text, key) in kindText" :key="key" :value="key">{{ text }}</option>
            </select>
          </label>
        </div>

        <div class="block">
          <p class="block-title">倒角（四边宽度，0 为直角）</p>
          <div class="grid-4">
            <BaseField label="上边" v-model="selectedFace.bevel.top" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
            <BaseField label="右边" v-model="selectedFace.bevel.right" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
            <BaseField label="下边" v-model="selectedFace.bevel.bottom" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
            <BaseField label="左边" v-model="selectedFace.bevel.left" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
          </div>
        </div>

        <div class="block">
          <div class="block-head">
            <p class="block-title">开孔</p>
            <BaseButton size="sm" @click="addHole">添加开孔</BaseButton>
          </div>
          <div v-if="selectedFace.holes.length === 0" class="hole-empty">暂无开孔，台盆/灶具孔位在此添加</div>
          <div v-for="hole in selectedFace.holes" :key="hole.id" class="hole-card">
            <input v-model="hole.name" class="input" @change="projectStore.persist()" />
            <select v-model="hole.kind" class="input" @change="projectStore.persist()">
              <option value="sink">台盆</option>
              <option value="cooktop">灶具</option>
              <option value="faucet">龙头圆孔</option>
              <option value="custom">自定义</option>
            </select>
            <BaseField label="X" v-model="hole.rect.x" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
            <BaseField label="Y" v-model="hole.rect.y" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
            <BaseField label="宽" v-model="hole.rect.w" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
            <BaseField label="高" v-model="hole.rect.h" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
            <BaseField label="圆角" v-model="hole.cornerRadiusMm" type="number" suffix="mm" @update:model-value="projectStore.persist()" />
            <BaseButton size="sm" variant="danger" @click="removeHole(hole.id)">移除</BaseButton>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: var(--sp-6);
}
.layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: var(--sp-5);
  align-items: start;
}
.card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.face-panel {
  padding: var(--sp-4);
}
.panel-head {
  margin-bottom: var(--sp-3);
}
.panel-title {
  font-weight: var(--fw-semibold);
}
.face-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.face-item {
  text-align: left;
  border: none;
  background: transparent;
  padding: var(--sp-3);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background var(--t-fast);
}
.face-item p {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.face-item:hover {
  background: var(--c-surface-2);
}
.face-item.active {
  background: var(--c-primary-soft);
  color: var(--c-primary);
}
.add-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
}
.editor {
  padding: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}
.editor-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.name-input {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  border: none;
  background: transparent;
  padding: var(--sp-1) 0;
  min-width: 240px;
}
.name-input:focus {
  outline: none;
}
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-4);
}
.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-4);
}
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
.input {
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  font-size: var(--fs-xs);
}
.block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.block-title {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}
.hole-empty {
  padding: var(--sp-5);
  border: 1px dashed var(--c-border);
  border-radius: var(--radius);
  color: var(--c-text-3);
  font-size: var(--fs-xs);
  text-align: center;
}
.hole-card {
  display: grid;
  grid-template-columns: 1.2fr 1fr repeat(5, 1fr) auto;
  gap: var(--sp-3);
  align-items: end;
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}
</style>
