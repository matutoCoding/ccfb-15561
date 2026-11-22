<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/page_header.vue'
import BaseButton from '@/components/ui/base_button.vue'
import { createGlContext, type GlContext } from '@/render/gl_context'
import { LayoutRenderer, type Camera } from '@/render/layout_renderer'
import { TexturePool, uploadSlabTexture, type GpuTexture } from '@/render/texture_pool'
import { generateProceduralTexture } from '@/render/procedural'
import { useProjectStore } from '@/stores/project_store'
import { useSlabStore } from '@/stores/slab_store'
import { usePlanStore } from '@/stores/plan_store'
import { useSettingsStore } from '@/stores/settings_store'
import { autoLayout } from '@/core/auto_layout'
import { hitTestPiece, validateLayout } from '@/core/constraints'
import { degToRad, radToDeg } from '@/core/geometry'
import { getPhotoBlob } from '@/core/db'
import type { Slab } from '@/core/types'

const props = defineProps<{ projectId: string }>()
const router = useRouter()
const projectStore = useProjectStore()
const slabStore = useSlabStore()
const planStore = usePlanStore()
const settingsStore = useSettingsStore()

const canvasRef = ref<HTMLCanvasElement>()
const glCtx = shallowRef<GlContext>()
const renderer = shallowRef<LayoutRenderer>()
const pool = shallowRef<TexturePool>()
const textures = new Map<string, GpuTexture>()

const activeSlabId = ref('')
const selectedPieceId = ref('')
const camera = reactive<Camera>({ scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 } })
const autoMsg = ref('')
const violations = ref<ReturnType<typeof validateLayout>>([])

const project = computed(() =>
  projectStore.projects.find((p) => p.id === props.projectId),
)
const activeSlab = computed<Slab | undefined>(() =>
  slabStore.slabs.find((s) => s.id === activeSlabId.value),
)
const plan = computed(() => planStore.current)

const piecesOnActiveSlab = computed(() =>
  plan.value?.pieces.filter((p) => p.slabId === activeSlabId.value) ?? [],
)

const selectedPiece = computed(
  () => plan.value?.pieces.find((p) => p.id === selectedPieceId.value),
)

const ensureTextures = async (slab: Slab): Promise<GpuTexture> => {
  const cached = textures.get(slab.id)
  if (cached) return cached
  const ctx = glCtx.value!
  let tex: GpuTexture
  if (slab.source === 'photo' && slab.photo) {
    const blob = await getPhotoBlob(slab.photo.blobKey)
    if (!blob) throw new Error(`大板 ${slab.code} 的照片数据缺失`)
    const bitmap = await createImageBitmap(blob)
    tex = uploadSlabTexture(
      ctx,
      bitmap,
      slab.widthMm,
      slab.heightMm,
      settingsStore.settings.workingTextureMax,
    )
    bitmap.close()
  } else if (slab.procedural) {
    const edge = Math.min(2048, ctx.maxTextureSize)
    tex = generateProceduralTexture(
      ctx,
      slab.procedural,
      edge,
      Math.round(edge / 2),
      slab.widthMm,
      slab.heightMm,
    )
  } else {
    throw new Error(`大板 ${slab.code} 没有可用纹理来源`)
  }
  textures.set(slab.id, tex)
  return tex
}

const fitCamera = (slab: Slab) => {
  const canvas = canvasRef.value!
  const pad = 48
  const sx = (canvas.clientWidth - pad * 2) / slab.widthMm
  const sy = (canvas.clientHeight - pad * 2) / slab.heightMm
  const s = Math.min(sx, sy)
  camera.scale.x = s
  camera.scale.y = s
  camera.offset.x = -(slab.widthMm * s) / 2
  camera.offset.y = -(slab.heightMm * s) / 2
}

const screenToWorld = (clientX: number, clientY: number) => {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1
  const ny = -(((clientY - rect.top) / rect.height) * 2 - 1)
  return {
    x: (nx - camera.offset.x) / camera.scale.x,
    y: (ny - camera.offset.y) / camera.scale.y,
  }
}

const draw = async () => {
  const slab = activeSlab.value
  const r = renderer.value
  if (!slab || !r) return
  const tex = await ensureTextures(slab)
  const faceMap = new Map(project.value?.faces.map((f) => [f.id, f]))
  const violatedIds = new Set(
    violations.value.filter((v) => v.pieceId).map((v) => v.pieceId),
  )
  const items = piecesOnActiveSlab.value.map((piece) => ({
    piece,
    texture: tex,
    finish: faceMap.get(piece.faceId)?.finish ?? 'polished',
    selected: piece.id === selectedPieceId.value,
    violated: violatedIds.has(piece.id),
  }))
  r.render(
    { scale: { ...camera.scale }, offset: { ...camera.offset } },
    {
      widthMm: slab.widthMm,
      heightMm: slab.heightMm,
      edgeMarginMm: slab.edgeMarginMm,
      defects: slab.defects,
    },
    items,
  )
}

const refreshValidation = () => {
  if (!plan.value) return
  const usedSlabs = slabStore.slabs.filter((s) =>
    plan.value!.slabIds.includes(s.id),
  )
  violations.value = validateLayout(plan.value.pieces, usedSlabs)
}

const runAutoLayout = () => {
  if (!project.value || slabStore.slabs.length === 0) {
    autoMsg.value = '请先在大板库录入至少一张大板'
    return
  }
  const result = autoLayout({
    faces: project.value.faces,
    slabs: slabStore.slabs,
    allowedAngles: settingsStore.settings.autoRotateAngles,
  })
  planStore.create(
    project.value.id,
    `方案 ${planStore.plans.length + 1}`,
    result.pieces,
    result.slabIdsUsed,
  ).then(() => {
    activeSlabId.value = result.slabIdsUsed[0] ?? slabStore.slabs[0].id
    refreshValidation()
    autoMsg.value =
      result.unplacedFaceIds.length > 0
        ? `已排 ${result.pieces.length} 件，${result.unplacedFaceIds.length} 个面大板不足`
        : `自动排样完成，共 ${result.pieces.length} 件，使用 ${result.slabIdsUsed.length} 张板`
    draw()
  })
}

// 拖动交互
const drag = reactive({ active: false, startX: 0, startY: 0, cx: 0, cy: 0 })

const onPointerDown = (event: PointerEvent) => {
  const world = screenToWorld(event.clientX, event.clientY)
  const hit = hitTestPiece(piecesOnActiveSlab.value, world)
  if (!hit) return
  selectedPieceId.value = hit.id
  drag.active = true
  drag.startX = event.clientX
  drag.startY = event.clientY
  drag.cx = hit.placement.cx
  drag.cy = hit.placement.cy
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
}

const onPointerMove = (event: PointerEvent) => {
  if (!drag.active || !selectedPiece.value) return
  const dx = (event.clientX - drag.startX) / camera.scale.x
  const dy = -(event.clientY - drag.startY) / camera.scale.y
  selectedPiece.value.placement.cx = drag.cx + dx
  selectedPiece.value.placement.cy = drag.cy + dy
  refreshValidation()
  draw()
}

const onPointerUp = () => {
  if (!drag.active) return
  drag.active = false
  if (plan.value && activeSlab.value) {
    planStore.persist(slabStore.slabs.filter((s) => plan.value!.slabIds.includes(s.id)))
  }
}

const rotateSelected = (deg: number) => {
  if (!selectedPiece.value) return
  const piece = selectedPiece.value
  piece.placement.angle = degToRad(
    Math.round((radToDeg(piece.placement.angle) + deg) / 5) * 5,
  )
  refreshValidation()
  planStore.persist(slabStore.slabs.filter((s) => plan.value!.slabIds.includes(s.id)))
  draw()
}

const nudge = (axis: 'cx' | 'cy', delta: number) => {
  if (!selectedPiece.value) return
  selectedPiece.value.placement[axis] += delta
  refreshValidation()
  draw()
}

const resizeCanvas = () => {
  const canvas = canvasRef.value
  const ctx = glCtx.value
  if (!canvas || !ctx) return
  const dpr = Math.min(window.devicePixelRatio, 2)
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
  if (activeSlab.value) draw()
}

const goMatching = () => {
  if (plan.value) router.push(`/matching/${plan.value.id}`)
}

onMounted(async () => {
  if (!projectStore.current || projectStore.current.id !== props.projectId) {
    await projectStore.open(props.projectId)
  }
  const canvas = canvasRef.value!
  const ctx = createGlContext(canvas, settingsStore.settings.msaaSamples)
  glCtx.value = ctx
  renderer.value = new LayoutRenderer(ctx)
  pool.value = new TexturePool(ctx)
  activeSlabId.value = slabStore.slabs[0]?.id ?? ''
  if (activeSlab.value) {
    fitCamera(activeSlab.value)
    await ensureTextures(activeSlab.value)
    draw()
  }
  window.addEventListener('resize', resizeCanvas)
  requestAnimationFrame(resizeCanvas)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCanvas)
  for (const tex of textures.values()) {
    glCtx.value?.gl.deleteTexture(tex.texture)
  }
  textures.clear()
  pool.value?.dispose()
})
</script>

<template>
  <div class="page">
    <PageHeader :title="project?.name ?? '排版编辑'" subtitle="拖动平移、按钮旋转，缺陷区与板边留量实时校验">
      <template #actions>
        <BaseButton @click="router.push(`/projects/${projectId}/faces`)">返回面编辑</BaseButton>
        <BaseButton variant="primary" @click="runAutoLayout">自动排样</BaseButton>
        <BaseButton @click="router.push(`/compare/${projectId}`)">方案对比</BaseButton>
        <BaseButton :disabled="!plan" @click="goMatching">对纹检查</BaseButton>
      </template>
    </PageHeader>

    <div v-if="slabStore.slabs.length === 0" class="warn card">
      大板库为空，请先录入大板后再排版。
      <BaseButton size="sm" @click="router.push('/slabs')">去大板库</BaseButton>
    </div>

    <div v-else class="workspace">
      <aside class="side card">
        <p class="side-title">投入大板</p>
        <div class="slab-tabs">
          <button
            v-for="slab in slabStore.slabs"
            :key="slab.id"
            class="slab-tab"
            :class="{ active: slab.id === activeSlabId }"
            @click="activeSlabId = slab.id; draw()"
          >
            {{ slab.code }}
            <span>{{ slab.batchNo }}#{{ slab.seqInBatch }}</span>
          </button>
        </div>

        <div v-if="selectedPiece" class="piece-panel">
          <p class="side-title">选中件 #{{ selectedPiece.seq }}</p>
          <p class="hint">中心 {{ Math.round(selectedPiece.placement.cx) }}, {{ Math.round(selectedPiece.placement.cy) }} mm</p>
          <p class="hint">角度 {{ Math.round(radToDeg(selectedPiece.placement.angle)) }}°</p>
          <div class="btn-grid">
            <BaseButton size="sm" @click="rotateSelected(-5)">左旋 5°</BaseButton>
            <BaseButton size="sm" @click="rotateSelected(5)">右旋 5°</BaseButton>
            <BaseButton size="sm" @click="nudge('cx', -10)">左移</BaseButton>
            <BaseButton size="sm" @click="nudge('cx', 10)">右移</BaseButton>
            <BaseButton size="sm" @click="nudge('cy', -10)">下移</BaseButton>
            <BaseButton size="sm" @click="nudge('cy', 10)">上移</BaseButton>
          </div>
          <label class="mirror">
            <input
              type="checkbox"
              :checked="selectedPiece.mirrorU"
              @change="selectedPiece.mirrorU = ($event.target as HTMLInputElement).checked; draw()"
            />
            纹理镜像（书本对纹）
          </label>
        </div>

        <div class="status">
          <p class="side-title">约束状态</p>
          <p v-if="violations.length === 0" class="ok">全部通过</p>
          <div v-for="v in violations" :key="v.id" class="violation" :class="v.level">
            {{ v.message }}
          </div>
        </div>
        <p v-if="autoMsg" class="auto-msg">{{ autoMsg }}</p>
      </aside>

      <div class="canvas-wrap card">
        <canvas
          ref="canvasRef"
          class="gl-canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        />
        <div v-if="!plan" class="canvas-tip">
          <p>还没有排版方案</p>
          <p>点击右上角「自动排样」生成第一版，再手动微调</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: var(--sp-6);
  height: 100%;
  display: flex;
  flex-direction: column;
}
.card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.warn {
  padding: var(--sp-4);
  display: flex;
  gap: var(--sp-4);
  align-items: center;
}
.workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: var(--sp-4);
}
.side {
  padding: var(--sp-4);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.side-title {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  margin-bottom: var(--sp-2);
}
.slab-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.slab-tab {
  display: flex;
  justify-content: space-between;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  border-radius: var(--radius);
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-xs);
  transition: all var(--t-fast);
}
.slab-tab span {
  color: var(--c-text-3);
}
.slab-tab:hover {
  background: var(--c-surface-2);
}
.slab-tab.active {
  border-color: var(--c-primary);
  background: var(--c-primary-soft);
  color: var(--c-primary);
}
.piece-panel {
  border-top: 1px solid var(--c-border);
  padding-top: var(--sp-4);
}
.hint {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
  margin-bottom: var(--sp-1);
}
.btn-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-2);
  margin: var(--sp-3) 0;
}
.mirror {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--c-text-2);
}
.status {
  border-top: 1px solid var(--c-border);
  padding-top: var(--sp-4);
}
.ok {
  font-size: var(--fs-xs);
  color: var(--c-success);
  font-weight: var(--fw-medium);
}
.violation {
  font-size: var(--fs-xs);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-sm);
  margin-bottom: var(--sp-1);
}
.violation.error {
  background: var(--c-danger-soft);
  color: var(--c-danger);
}
.violation.warning {
  background: var(--c-warning-soft);
  color: var(--c-warning);
}
.auto-msg {
  font-size: var(--fs-xs);
  color: var(--c-primary);
}
.canvas-wrap {
  position: relative;
  min-height: 480px;
  overflow: hidden;
}
.gl-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: grab;
}
.gl-canvas:active {
  cursor: grabbing;
}
.canvas-tip {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
  gap: var(--sp-2);
  color: var(--c-text-3);
  pointer-events: none;
}
.canvas-tip p:first-child {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}
</style>
