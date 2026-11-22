<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/page_header.vue'
import BaseButton from '@/components/ui/base_button.vue'
import { createGlContext, type GlContext } from '@/render/gl_context'
import { SeamSampler } from '@/render/seam_sampler'
import { uploadSlabTexture, type GpuTexture } from '@/render/texture_pool'
import { generateProceduralTexture } from '@/render/procedural'
import { usePlanStore } from '@/stores/plan_store'
import { useSlabStore } from '@/stores/slab_store'
import { useSettingsStore } from '@/stores/settings_store'
import {
  applyBookMatch,
  applySequenceMatch,
  createSeam,
  evaluateSeam,
} from '@/core/matching'
import { getPhotoBlob } from '@/core/db'
import type { MatchMode, PlacedPiece, Slab } from '@/core/types'

const props = defineProps<{ planId: string }>()
const router = useRouter()
const planStore = usePlanStore()
const slabStore = useSlabStore()
const settingsStore = useSettingsStore()

const canvasRef = ref<HTMLCanvasElement>()
const glCtx = shallowRef<GlContext>()
const sampler = shallowRef<SeamSampler>()
const textureCache = new Map<string, GpuTexture>()
const mode = ref<MatchMode>('book')
const checking = ref(false)

const plan = computed(() =>
  planStore.plans.find((p) => p.id === props.planId),
)

const loadTexture = async (slab: Slab): Promise<GpuTexture> => {
  const cached = textureCache.get(slab.id)
  if (cached) return cached
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
  textureCache.set(slab.id, tex)
  return tex
}

// 缝两侧亮度采样回调
const makeSampler = (tex: GpuTexture) => (world: { x: number; y: number }) => {
  const strip = sampler.value!.sample(tex, [world])
  return strip[0]
}

const runCheck = async () => {
  if (!plan.value) return
  checking.value = true
  // 先按模式应用镜像关系
  const transformed: PlacedPiece[] =
    mode.value === 'book'
      ? applyBookMatch(plan.value.pieces)
      : applySequenceMatch(plan.value.pieces)
  plan.value.pieces = transformed

  const slabMap = new Map(slabStore.slabs.map((s) => [s.id, s]))
  const seams = []
  // 同一块板上按序号相邻的件两两检测
  const grouped = new Map<string, PlacedPiece[]>()
  for (const piece of plan.value.pieces) {
    const list = grouped.get(piece.slabId) ?? []
    list.push(piece)
    grouped.set(piece.slabId, list)
  }
  for (const [slabId, list] of grouped) {
    const ordered = [...list].sort((a, b) => a.seq - b.seq)
    const slab = slabMap.get(slabId)
    if (!slab) continue
    const tex = await loadTexture(slab)
    const pxPerMm = tex.width / slab.widthMm
    for (let i = 0; i < ordered.length - 1; i++) {
      const result = evaluateSeam(
        ordered[i],
        ordered[i + 1],
        mode.value,
        makeSampler(tex),
        {
          stripWidthMm: 30,
          sampleCount: 128,
          pxPerMm,
          tolerancePx: settingsStore.settings.matchTolerancePx,
        },
      )
      if (result) seams.push(createSeam(result))
    }
  }
  planStore.setSeams(seams)
  await planStore.persist(slabStore.slabs.filter((s) => plan.value!.slabIds.includes(s.id)))
  checking.value = false
  drawSeamPreview()
}

// 2D 预览：画大板轮廓、件与缝的错位标注
const drawSeamPreview = () => {
  const canvas = canvasRef.value
  const ctx = glCtx.value
  if (!canvas || !ctx || !plan.value) return
  const gl = ctx.gl
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.clearColor(0.97, 0.97, 0.96, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  // 用 2D 覆盖层做标注更直接，这里保留 GL 清屏，标注交给 SVG 层
}

const previewSvg = computed(() => {
  if (!plan.value || plan.value.seams.length === 0) return null
  const slab = slabStore.slabs.find((s) => s.id === plan.value!.slabIds[0])
  if (!slab) return null
  const w = 640
  const h = (w * slab.heightMm) / slab.widthMm
  const sx = w / slab.widthMm
  const pieces = plan.value.pieces.filter((p) => p.slabId === slab.id)
  return { slab, w, h, sx, pieces }
})

const mismatchSummary = computed(() => {
  const seams = plan.value?.seams ?? []
  if (seams.length === 0) return undefined
  const max = Math.max(...seams.map((s) => s.mismatchPx))
  const passed = seams.every((s) => s.passed)
  return { max, passed, total: seams.length }
})

onMounted(async () => {
  await planStore.open(props.planId)
  const canvas = canvasRef.value!
  glCtx.value = createGlContext(canvas, 1)
  sampler.value = new SeamSampler(glCtx.value)
  const dpr = Math.min(window.devicePixelRatio, 2)
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
  drawSeamPreview()
})

onBeforeUnmount(() => {
  sampler.value?.dispose()
  for (const tex of textureCache.values()) {
    glCtx.value?.gl.deleteTexture(tex.texture)
  }
})
</script>

<template>
  <div class="page">
    <PageHeader title="对纹检查" subtitle="缝两侧纹带 NCC 模板匹配，量化纹路错位像素">
      <template #actions>
        <BaseButton @click="router.back()">返回</BaseButton>
        <BaseButton
          :variant="mode === 'book' ? 'primary' : 'secondary'"
          @click="mode = 'book'"
        >
          书本对纹
        </BaseButton>
        <BaseButton
          :variant="mode === 'sequence' ? 'primary' : 'secondary'"
          @click="mode = 'sequence'"
        >
          连续对纹
        </BaseButton>
        <BaseButton variant="primary" :disabled="checking || !plan" @click="runCheck">
          {{ checking ? '检测中…' : '执行对纹检测' }}
        </BaseButton>
      </template>
    </PageHeader>

    <div v-if="!plan" class="empty card">
      没有打开的排版方案，请先在排版编辑页生成方案。
    </div>

    <template v-else>
      <div v-if="mismatchSummary" class="summary card" :class="{ fail: !mismatchSummary.passed }">
        <p class="summary-title">
          {{ mismatchSummary.passed ? '对纹合格' : '对纹超差' }}
        </p>
        <p class="summary-text">
          共 {{ mismatchSummary.total }} 条缝，最大错位
          <strong>{{ mismatchSummary.max.toFixed(2) }}</strong> px，
          合格阈值 {{ settingsStore.settings.matchTolerancePx }} px
        </p>
      </div>

      <div class="workspace">
        <div class="canvas-card card">
          <canvas ref="canvasRef" class="gl-canvas" />
          <svg
            v-if="previewSvg"
            :viewBox="`0 0 ${previewSvg.w} ${previewSvg.h}`"
            class="svg-layer"
          >
            <rect
              x="0" y="0"
              :width="previewSvg.w"
              :height="previewSvg.h"
              fill="none"
              stroke="var(--c-border)"
              stroke-width="2"
            />
            <rect
              v-for="piece in previewSvg.pieces"
              :key="piece.id"
              :x="(piece.placement.cx - piece.placement.w / 2) * previewSvg.sx"
              :y="previewSvg.h - (piece.placement.cy + piece.placement.h / 2) * previewSvg.sx"
              :width="piece.placement.w * previewSvg.sx"
              :height="piece.placement.h * previewSvg.sx"
              :transform="`rotate(${(-piece.placement.angle * 180) / Math.PI} ${piece.placement.cx * previewSvg.sx} ${previewSvg.h - piece.placement.cy * previewSvg.sx})`"
              fill="rgba(37,99,235,0.08)"
              stroke="var(--c-primary)"
              stroke-width="1.5"
            />
            <g v-for="seam in plan.seams" :key="seam.id">
              <line
                :x1="seam.a.x * previewSvg.sx"
                :y1="previewSvg.h - seam.a.y * previewSvg.sx"
                :x2="seam.b.x * previewSvg.sx"
                :y2="previewSvg.h - seam.b.y * previewSvg.sx"
                :stroke="seam.passed ? 'var(--c-success)' : 'var(--c-danger)'"
                stroke-width="3"
              />
            </g>
          </svg>
        </div>

        <aside class="side card">
          <p class="side-title">缝明细</p>
          <div v-if="plan.seams.length === 0" class="muted">
            执行检测后列出每条缝的错位量与置信度
          </div>
          <div v-for="seam in plan.seams" :key="seam.id" class="seam-row" :class="{ fail: !seam.passed }">
            <div class="seam-head">
              <span>{{ seam.mode === 'book' ? '书本对纹' : '连续对纹' }}</span>
              <span class="tag" :class="seam.passed ? 'ok' : 'bad'">
                {{ seam.passed ? '合格' : '超差' }}
              </span>
            </div>
            <p class="seam-line">错位 {{ seam.mismatchPx.toFixed(2) }} px / {{ seam.mismatchMm.toFixed(1) }} mm</p>
            <p class="seam-line">置信度 {{ (seam.confidence * 100).toFixed(0) }}%</p>
          </div>
        </aside>
      </div>
    </template>
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
.summary {
  padding: var(--sp-4) var(--sp-5);
  margin-bottom: var(--sp-4);
  border-left: 4px solid var(--c-success);
}
.summary.fail {
  border-left-color: var(--c-danger);
}
.summary-title {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--c-success);
}
.summary.fail .summary-title {
  color: var(--c-danger);
}
.summary-text {
  margin-top: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--c-text-2);
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--sp-4);
}
.canvas-card {
  position: relative;
  min-height: 520px;
  overflow: hidden;
}
.gl-canvas {
  width: 100%;
  height: 520px;
  display: block;
}
.svg-layer {
  position: absolute;
  inset: var(--sp-4);
  width: calc(100% - 32px);
  height: calc(100% - 32px);
  pointer-events: none;
}
.side {
  padding: var(--sp-4);
  max-height: 560px;
  overflow: auto;
}
.side-title {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  margin-bottom: var(--sp-3);
}
.muted {
  font-size: var(--fs-xs);
  color: var(--c-text-3);
}
.seam-row {
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: var(--sp-3);
  margin-bottom: var(--sp-2);
}
.seam-row.fail {
  border-color: var(--c-danger);
  background: var(--c-danger-soft);
}
.seam-head {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  margin-bottom: var(--sp-2);
}
.tag {
  padding: 1px var(--sp-2);
  border-radius: var(--radius-sm);
  font-size: var(--fs-xs);
}
.tag.ok {
  background: var(--c-success-soft);
  color: var(--c-success);
}
.tag.bad {
  background: var(--c-danger-soft);
  color: var(--c-danger);
}
.seam-line {
  font-size: var(--fs-xs);
  color: var(--c-text-2);
  margin-top: 2px;
}
</style>
