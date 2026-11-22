<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/page_header.vue'
import BaseButton from '@/components/ui/base_button.vue'
import { createGlContext, type GlContext } from '@/render/gl_context'
import { SceneRenderer } from '@/render/scene_renderer'
import { uploadSlabTexture, type GpuTexture } from '@/render/texture_pool'
import { generateProceduralTexture } from '@/render/procedural'
import { usePlanStore } from '@/stores/plan_store'
import { useProjectStore } from '@/stores/project_store'
import { useSlabStore } from '@/stores/slab_store'
import { useSettingsStore } from '@/stores/settings_store'
import { getPhotoBlob } from '@/core/db'
import type { SurfaceFinish } from '@/core/types'
import { downloadTextFile } from '@/core/export_dxf'

const props = defineProps<{ planId: string }>()
const router = useRouter()
const planStore = usePlanStore()
const projectStore = useProjectStore()
const slabStore = useSlabStore()
const settingsStore = useSettingsStore()

const canvasRef = ref<HTMLCanvasElement>()
const glCtx = shallowRef<GlContext>()
const scene = shallowRef<SceneRenderer>()
const textureCache = new Map<string, GpuTexture>()
const finish = ref<SurfaceFinish>('polished')
const room = ref<'kitchen' | 'living-room'>('kitchen')

const plan = computed(() =>
  planStore.plans.find((p) => p.id === props.planId),
)
const project = computed(() =>
  plan.value ? projectStore.projects.find((p) => p.id === plan.value!.projectId) : undefined,
)

const loadTexture = async (slabId: string): Promise<GpuTexture> => {
  const cached = textureCache.get(slabId)
  if (cached) return cached
  const slab = slabStore.byId(slabId)
  if (!slab) throw new Error('大板数据缺失')
  const ctx = glCtx.value!
  let tex: GpuTexture
  if (slab.source === 'photo' && slab.photo) {
    const blob = await getPhotoBlob(slab.photo.blobKey)
    const bitmap = await createImageBitmap(blob!)
    tex = uploadSlabTexture(
      ctx,
      bitmap,
      slab.widthMm,
      slab.heightMm,
      settingsStore.settings.workingTextureMax,
    )
    bitmap.close()
  } else {
    tex = generateProceduralTexture(
      ctx,
      slab.procedural!,
      Math.min(2048, ctx.maxTextureSize),
      Math.min(1024, ctx.maxTextureSize),
      slab.widthMm,
      slab.heightMm,
    )
  }
  textureCache.set(slabId, tex)
  return tex
}

const buildScene = async () => {
  if (!plan.value || !scene.value) return
  scene.value.clearMeshes()
  const faceMap = new Map(project.value?.faces.map((f) => [f.id, f]))
  for (const piece of plan.value.pieces) {
    const tex = await loadTexture(piece.slabId)
    const face = faceMap.get(piece.faceId)
    scene.value.buildCountertopMesh(piece, tex, face?.dropEdgeMm ?? 0)
  }
  scene.value.setFinish(finish.value)
  scene.value.render()
}

const changeFinish = (value: SurfaceFinish) => {
  finish.value = value
  scene.value?.setFinish(value)
  scene.value?.render()
}

const rotateView = (angleDeg: number) => {
  if (!scene.value) return
  const rad = (angleDeg * Math.PI) / 180
  const r = 3600
  scene.value.setCamera(
    [Math.cos(rad) * r, Math.sin(rad) * r, 2400],
    [0, 0, 0],
  )
  scene.value.render()
}

const exportPng = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${plan.value?.name ?? 'layout'}-preview.png`
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

const exportLayoutPng = () => {
  // 排版图：把当前画布内容直接导出
  exportPng()
}

const exportDxf = () => {
  if (!plan.value || !project.value) return
  import('@/core/export_dxf').then(({ buildDxf }) => {
    const slabs = slabStore.slabs.filter((s) => plan.value!.slabIds.includes(s.id))
    const dxf = buildDxf({
      slabs,
      pieces: plan.value!.pieces,
      faces: project.value!.faces,
    })
    downloadTextFile(dxf, `${plan.value!.name}.dxf`, 'application/dxf')
  })
}

const exportBom = () => {
  if (!plan.value || !project.value) return
  import('@/core/export_bom').then(({ exportBomCsv }) => {
    const slabs = slabStore.slabs.filter((s) => plan.value!.slabIds.includes(s.id))
    exportBomCsv(plan.value!, project.value!.faces, slabs, `${plan.value!.name}-bom.csv`)
  })
}

onMounted(async () => {
  await planStore.open(props.planId)
  const canvas = canvasRef.value!
  const ctx = createGlContext(canvas, settingsStore.settings.msaaSamples)
  glCtx.value = ctx
  scene.value = new SceneRenderer(ctx)
  const dpr = Math.min(window.devicePixelRatio, 2)
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
  scene.value.setCamera([2600, -2200, 2400], [0, 0, 0])
  await buildScene()
})

onBeforeUnmount(() => {
  scene.value?.dispose()
  for (const tex of textureCache.values()) {
    glCtx.value?.gl.deleteTexture(tex.texture)
  }
})
</script>

<template>
  <div class="page">
    <PageHeader title="渲染预览" subtitle="真实尺寸贴回场景，侧边与下垂边纹理物理连续">
      <template #actions>
        <BaseButton @click="router.back()">返回</BaseButton>
        <BaseButton @click="exportDxf">导出 DXF</BaseButton>
        <BaseButton @click="exportBom">用料清单</BaseButton>
        <BaseButton variant="primary" @click="exportLayoutPng">导出 PNG</BaseButton>
      </template>
    </PageHeader>

    <div v-if="!plan" class="empty card">没有打开的排版方案。</div>

    <div v-else class="workspace">
      <div class="canvas-card card">
        <canvas ref="canvasRef" class="gl-canvas" />
        <div class="view-controls">
          <BaseButton size="sm" @click="rotateView(-30)">左转 30°</BaseButton>
          <BaseButton size="sm" @click="rotateView(30)">右转 30°</BaseButton>
          <BaseButton size="sm" @click="rotateView(0)">复位视角</BaseButton>
        </div>
      </div>

      <aside class="side card">
        <p class="side-title">表面处理</p>
        <div class="finish-list">
          <button
            v-for="item in [
              { key: 'polished', label: '亮光面', desc: '低粗糙强镜面' },
              { key: 'honed', label: '哑光面', desc: '高粗糙弱反射' },
              { key: 'leathered', label: '荔枝面', desc: '微凹凸漫反射' },
            ]"
            :key="item.key"
            class="finish-item"
            :class="{ active: finish === item.key }"
            @click="changeFinish(item.key as SurfaceFinish)"
          >
            <span class="finish-label">{{ item.label }}</span>
            <span class="finish-desc">{{ item.desc }}</span>
          </button>
        </div>

        <p class="side-title">场景</p>
        <div class="room-tabs">
          <button
            class="room-tab"
            :class="{ active: room === 'kitchen' }"
            @click="room = 'kitchen'"
          >
            厨房
          </button>
          <button
            class="room-tab"
            :class="{ active: room === 'living-room' }"
            @click="room = 'living-room'"
          >
            客厅
          </button>
        </div>

        <div class="plan-meta">
          <p class="side-title">方案数据</p>
          <p class="meta-line">切割件 {{ plan.pieces.length }} 个</p>
          <p class="meta-line">投入大板 {{ plan.slabIds.length }} 张</p>
          <p class="meta-line">利用率 {{ (plan.utilization * 100).toFixed(1) }}%</p>
          <p class="meta-line">对纹缝 {{ plan.seams.length }} 条</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: var(--sp-6);
}
.card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.empty {
  padding: var(--sp-5);
  color: var(--c-text-3);
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: var(--sp-4);
}
.canvas-card {
  position: relative;
  min-height: 560px;
  overflow: hidden;
}
.gl-canvas {
  width: 100%;
  height: 560px;
  display: block;
}
.view-controls {
  position: absolute;
  left: var(--sp-4);
  bottom: var(--sp-4);
  display: flex;
  gap: var(--sp-2);
}
.side {
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.side-title {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}
.finish-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.finish-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  border-radius: var(--radius);
  padding: var(--sp-3);
  transition: all var(--t-fast);
}
.finish-item:hover {
  background: var(--c-surface-2);
}
.finish-item.active {
  border-color: var(--c-primary);
  background: var(--c-primary-soft);
}
.finish-label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
}
.finish-desc {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.room-tabs {
  display: flex;
  gap: var(--sp-1);
  background: var(--c-surface-2);
  padding: 3px;
  border-radius: var(--radius);
}
.room-tab {
  flex: 1;
  border: none;
  background: transparent;
  padding: var(--sp-2);
  border-radius: var(--radius-sm);
  font-size: var(--fs-xs);
  color: var(--c-text-2);
}
.room-tab.active {
  background: var(--c-surface);
  color: var(--c-primary);
  font-weight: var(--fw-medium);
  box-shadow: var(--shadow-sm);
}
.plan-meta {
  border-top: 1px solid var(--c-border);
  padding-top: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.meta-line {
  font-size: var(--fs-xs);
  color: var(--c-text-2);
}
</style>
